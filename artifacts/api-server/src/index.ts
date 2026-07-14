import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { startScheduler } from "./lib/scheduler";
import { ensureSessionTable } from "./lib/session";

// Railway/Render/Fly menyuntik PORT sendiri. Default 3000 supaya
// `docker run` dan `pnpm dev` tetap jalan tanpa env tambahan.
const port = Number(process.env["PORT"] ?? 3000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

// Bootstrap: siapkan session store DULU, baru terima request. Kegagalan
// tabel session TIDAK LAGI mematikan proses (lihat ensureSessionTable) —
// server tetap listen dan login tetap jalan lewat bearer token walau
// cookie session tidak tersimpan, alih-alih seluruh server ikut down.
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
