import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import { COOKIE_DOMAIN, SESSION_SECRET, isProduction, TOKEN_TTL_SECONDS } from "./env";
import { logger } from "./logger";

const TABLE_NAME = "scraper_sessions";

/**
 * BUG KRITIS YANG DIPERBAIKI:
 *
 * connect-pg-simple membuat tabel session dengan MEMBACA FILE dari disk:
 *     await fs.readFile(path.resolve(__dirname, './table.sql'), 'utf8')
 *
 * Kita mem-bundle server dengan esbuild jadi satu file. Setelah dibundle,
 * __dirname = dist/src dan table.sql tidak ikut ter-copy ke sana. Jadi
 * `createTableIfMissing: true` GAGAL DIAM-DIAM: tabel scraper_sessions tidak
 * pernah dibuat, store.set() selalu error, dan session TIDAK PERNAH tersimpan.
 *
 * Gejalanya persis seperti yang terjadi: POST /auth/login balas 200 ("login
 * berhasil"), tapi GET /auth/me selalu 401 dan user dilempar balik ke /login
 * selamanya.
 *
 * Solusinya: buat tabelnya sendiri lewat DDL inline (tidak baca file apa pun),
 * lalu matikan createTableIfMissing.
 */
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "${TABLE_NAME}" (
  "sid"    varchar NOT NULL COLLATE "default",
  "sess"   json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "${TABLE_NAME}_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS "IDX_${TABLE_NAME}_expire" ON "${TABLE_NAME}" ("expire");
`;

/**
 * Dipanggil sekali saat startup, SEBELUM server mulai listen.
 *
 * SENGAJA tidak melempar error ke pemanggil: kalau CREATE TABLE gagal (mis.
 * DB down saat boot), server tetap harus bisa listen dan menjawab request —
 * auth masih jalan lewat bearer token walau session cookie tidak akan
 * pernah persist, daripada seluruh server ikut mati (process.exit) gara-gara
 * session store doang.
 */
export async function ensureSessionTable(): Promise<void> {
  try {
    await pool.query(CREATE_TABLE_SQL);
    logger.info({ table: TABLE_NAME }, "Session store siap");
  } catch (err) {
    logger.error({ err, table: TABLE_NAME }, "Gagal menyiapkan session store — auth tetap jalan lewat bearer token");
  }
}

const PgSession = connectPgSimple(session);

/**
 * Aturan cookie lintas-domain:
 *
 * - COOKIE_DOMAIN di-set (mis. ".aina.id"): FE & BE satu site.
 *   -> SameSite=Lax. Paling aman, tidak kena blokir third-party cookie.
 *
 * - COOKIE_DOMAIN kosong + production: FE (vercel.app) & BE (railway.app)
 *   adalah site berbeda -> SameSite=None + Secure. WAJIB, kalau tidak cookie
 *   langsung didrop browser. Catatan: Safari/Brave tetap bisa memblokirnya —
 *   bearer token (lib/token.ts) adalah jalur cadangannya.
 *
 * - Development: SameSite=Lax, Secure=false (http://localhost).
 */
const crossSite = isProduction && !COOKIE_DOMAIN;

export const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: TABLE_NAME,
    // JANGAN diaktifkan — lihat komentar di atas. Tabel dibuat oleh
    // ensureSessionTable() dengan DDL inline.
    createTableIfMissing: false,
    // Bersihkan session kedaluwarsa tiap jam.
    pruneSessionInterval: 60 * 60,
    // Tanpa ini, kegagalan store (mis. DB down) diam-diam ditelan oleh
    // connect-pg-simple — request menggantung atau session tidak pernah
    // tersimpan tanpa jejak log apa pun.
    errorLog: (err: unknown) => logger.error({ err }, "session store error"),
  }),
  name: "aina.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  // Percaya X-Forwarded-Proto dari proxy Railway, supaya cookie Secure tetap
  // dikirim walaupun koneksi internal ke Node-nya HTTP.
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: crossSite ? "none" : "lax",
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: "/",
  },
});

// Augment express-session typings
declare module "express-session" {
  interface SessionData {
    user?: {
      username: string;
      role: "contributor" | "admin";
    };
  }
}
