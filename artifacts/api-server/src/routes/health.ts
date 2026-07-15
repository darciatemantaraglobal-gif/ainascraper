import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Health check YANG MENYENTUH database.
 *
 * /healthz di atas SENGAJA tidak query DB — itu dipakai Railway sebagai
 * healthcheckPath, dan kalau ikut cek DB, Railway akan me-restart-loop
 * server setiap kali Supabase pause/putus padahal servernya sendiri sehat.
 *
 * Endpoint ini untuk DIAGNOSIS manual: membedakan "Railway up tapi DB mati"
 * (login balas 503 DB_UNAVAILABLE) dari "Railway-nya yang down".
 *
 *   curl https://<railway-app>/api/healthz     -> server hidup?
 *   curl https://<railway-app>/api/healthz/db  -> server bisa nyambung ke Supabase?
 */
router.get("/healthz/db", async (req, res): Promise<void> => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", db: "ok" });
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    req.log?.error({ err, pgCode: pgErr.code }, "[healthz/db] DB tidak terjangkau");
    res.status(503).json({
      status: "degraded",
      db: "unreachable",
      // Pesan error pg asli sengaja diteruskan: ini endpoint diagnosis,
      // dan pesannya (timeout vs password vs ENOTFOUND) langsung menunjuk
      // ke akar masalah (project pause vs connection string basi vs DNS).
      error: pgErr.message ?? "unknown",
      code: pgErr.code ?? null,
    });
  }
});

export default router;
