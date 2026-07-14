import app from "./app";
import { logger } from "./lib/logger";
import { pool, describeDbConfig } from "@workspace/db";
import { startScheduler } from "./lib/scheduler";
import { ensureSessionTable } from "./lib/session";

// Railway/Render/Fly menyuntik PORT sendiri. Default 3000 supaya
// `docker run` dan `pnpm dev` tetap jalan tanpa env tambahan.
const port = Number(process.env["PORT"] ?? 3000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

// Preflight: satu baris ringkas yang harus cukup untuk diagnosa dari log
// Railway tanpa perlu SSH — host/port DB, SSL, env wajib (boolean saja,
// TIDAK PERNAH nilai aslinya).
const dbConfig = describeDbConfig();

logger.info(
  {
    env: process.env.NODE_ENV ?? "development",
    dbHost: dbConfig.host,
    dbPort: dbConfig.port,
    dbSsl: dbConfig.ssl,
    requiredEnv: {
      SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
      SUPABASE_DB_URL: Boolean(process.env.SUPABASE_DB_URL),
      SCRAPER_AUTHOR_ID: Boolean(process.env.SCRAPER_AUTHOR_ID),
      CRON_SECRET: Boolean(process.env.CRON_SECRET),
    },
  },
  "Preflight startup config",
);

if (dbConfig.port === 6543) {
  logger.warn(
    { dbPort: dbConfig.port },
    "Transaction Pooler terdeteksi — connect-pg-simple butuh Session Pooler (port 5432)",
  );
}

// Bootstrap: siapkan session store DULU, baru terima request. Kegagalan
// tabel session TIDAK LAGI mematikan proses (lihat ensureSessionTable) —
// server tetap listen dan auth tetap jalan lewat bearer token; kegagalan
// itu terlihat di /healthz/deep, bukan lewat crash yang menyembunyikan
// penyebab sebenarnya (DB down vs session store down).
await ensureSessionTable();

const server = app.listen(port, "0.0.0.0", () => {
  logger.info(
    { port, env: process.env.NODE_ENV ?? "development" },
    "Server listening",
  );

  // Menjalankan cron sesuai run_at di cron_settings.
  // Matikan dengan ENABLE_SCHEDULER=false kalau replica > 1.
  startScheduler();
});

// Graceful shutdown: Railway kirim SIGTERM saat redeploy. Tanpa ini,
// request in-flight terpotong dan koneksi Postgres bocor.
function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down...");

  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});
