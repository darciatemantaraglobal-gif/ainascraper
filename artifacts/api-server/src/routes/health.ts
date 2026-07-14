import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool, describeDbConfig } from "@workspace/db";
import { sessionStoreReady } from "../lib/session";
import { CORS_ORIGINS, COOKIE_DOMAIN, CRON_SECRET } from "../lib/env";

const router: IRouter = Router();

const DB_PING_TIMEOUT_MS = 3_000;

/** SELECT 1 dengan timeout — pool.query() sendiri tidak punya batas waktu. */
async function pingDb(): Promise<{ ok: true; latencyMs: number } | { ok: false; latencyMs: number; error: string }> {
  const started = Date.now();

  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error(`DB ping timeout setelah ${DB_PING_TIMEOUT_MS}ms`)), DB_PING_TIMEOUT_MS),
      ),
    ]);

    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: pgErr.code ? `${pgErr.code}: ${pgErr.message}` : String(pgErr.message ?? err),
    };
  }
}

// Dangkal, dipakai Railway sebagai healthcheck — tapi tetap memverifikasi DB
// nyala, supaya container yang "listening" tapi tidak bisa query tidak
// dianggap sehat.
router.get("/healthz", async (_req: Request, res: Response): Promise<void> => {
  const ping = await pingDb();

  if (!ping.ok) {
    res.status(503).json({ status: "degraded", db: "down" });
    return;
  }

  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Diagnostik dalam — TIDAK PERNAH membocorkan nilai secret, cuma
// boolean/angka. Publik kalau CRON_SECRET belum di-set; kalau sudah,
// wajib header Authorization: Bearer <CRON_SECRET>.
router.get("/healthz/deep", async (req: Request, res: Response): Promise<void> => {
  if (CRON_SECRET) {
    const authHeader = req.headers["authorization"] ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (token !== CRON_SECRET) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const ping = await pingDb();
  const dbConfig = describeDbConfig();

  let scraperUsersCount: number | null = null;
  let scraperSessionsExists = false;

  if (ping.ok) {
    try {
      const [{ count }] = (
        await pool.query('SELECT count(*)::int AS count FROM "scraper_users"')
      ).rows as { count: number }[];
      scraperUsersCount = count;
    } catch {
      scraperUsersCount = null;
    }

    try {
      const { rowCount } = await pool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'scraper_sessions'",
      );
      scraperSessionsExists = (rowCount ?? 0) > 0;
    } catch {
      scraperSessionsExists = false;
    }
  }

  res.json({
    db: ping,
    tables: {
      scraper_users: scraperUsersCount,
      scraper_sessions: scraperSessionsExists,
    },
    sessionStore: { ready: sessionStoreReady() },
    env: {
      SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
      SUPABASE_DB_URL: Boolean(process.env.SUPABASE_DB_URL),
      SCRAPER_AUTHOR_ID: Boolean(process.env.SCRAPER_AUTHOR_ID),
      CORS_ORIGINS,
      COOKIE_DOMAIN: Boolean(COOKIE_DOMAIN),
      dbHost: dbConfig.host,
      dbPort: dbConfig.port,
    },
    node: {
      env: process.env.NODE_ENV ?? "development",
      uptimeSec: Math.round(process.uptime()),
    },
  });
});

export default router;
