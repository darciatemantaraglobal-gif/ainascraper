import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { resolveDbConfig } from "./config";

const { Pool } = pg;

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

export const pool = new Pool(poolConfig);

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

pool.on("connect", (client) => {
  client.query(`SET search_path TO ${SEARCH_PATH}`).catch((err: Error) => {
    console.error("[db] Gagal set search_path:", err.message);
  });
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
