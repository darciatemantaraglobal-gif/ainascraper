import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { resolveDbConfig } from "./config";

export { resolveDbConfig, describeDbConfig, needsSsl } from "./config";
export type { DbConfig, DbDiagnostics } from "./config";

const { Pool } = pg;

/**
 * Pool dibuat lazily (saat query pertama), bukan saat modul di-import.
 *
 * Kenapa: kalau SUPABASE_DB_URL/DATABASE_URL belum di-set, server tetap
 * harus bisa boot (misal saat pertama kali di-deploy sebelum secret
 * ditambahkan) — tapi setiap query tetap gagal EKSPLISIT dengan pesan
 * jelas dari resolveDbConfig(), bukan silent fallback ke DB palsu.
 */
let poolInstance: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!poolInstance) {
    const { connectionString, ssl } = resolveDbConfig();

    const poolConfig: pg.PoolConfig = {
      connectionString,
      // Batasi koneksi: Supabase free tier punya limit koneksi yang kecil.
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    };

    if (ssl) {
      poolConfig.ssl = { rejectUnauthorized: false };
    }

    poolInstance = new Pool(poolConfig);

    poolInstance.on("connect", (client) => {
      client.query(`SET search_path TO ${SEARCH_PATH}`).catch((err: Error) => {
        console.error("[db] Gagal set search_path:", err.message);
      });
    });

    poolInstance.on("error", (err) => {
      console.error("[db] Unexpected pool error:", err.message);
    });
  }

  return poolInstance;
}

export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    const real = getPool();
    const value = Reflect.get(real, prop, real);
    // Bind to the real Pool instance (not the proxy) so methods that read
    // internal state via `this` keep working correctly.
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/**
 * PENTING (sumber bug 500 di /scrape/url & /scrape/instagram):
 *
 * Di Supabase, extension pgvector diinstall ke schema `extensions`, BUKAN
 * `public`. SQL Editor punya search_path yang sudah mencakup `extensions`,
 * makanya query dedupe jalan mulus di sana. Tapi koneksi aplikasi lewat
 * pooler TIDAK selalu begitu — akibatnya:
 *
 *     SELECT ... ${vec}::vector ...
 *     -> ERROR: type "vector" does not exist
 *
 * Query gagal -> findDuplicates() throw -> Express balas 500, padahal
 * scrape-nya sendiri sudah berhasil.
 *
 * Kita paksa search_path di setiap koneksi baru. Aman kalau pgvector
 * ternyata ada di `public` (schema `extensions` tetap ada di semua project
 * Supabase, jadi tidak akan error).
 */
const SEARCH_PATH = process.env.DB_SEARCH_PATH ?? "public, extensions";

// `pool` di atas cuma Proxy — akses .on/.error di sini SENGAJA tidak
// dilakukan lagi (sudah didaftarkan di dalam getPool() saat pool asli
// dibuat), supaya import modul ini tidak memaksa koneksi DB lebih awal.

export const db = drizzle(pool, { schema });

export * from "./schema";
