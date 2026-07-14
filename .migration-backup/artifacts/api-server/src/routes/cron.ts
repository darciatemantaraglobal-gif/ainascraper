import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, cronLogsTable, cronSettingsTable } from "@workspace/db";
import { GetCronLogsQueryParams, UpdateCronSettingsBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import { runCronJob } from "../lib/cronRunner";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Endpoint: GET /cron/logs
// ---------------------------------------------------------------------------
router.get("/cron/logs", requireAdmin, async (req, res): Promise<void> => {
  const queryParsed = GetCronLogsQueryParams.safeParse(req.query);
  const limit = queryParsed.success ? (queryParsed.data.limit ?? 50) : 50;

  const logs = await db.select().from(cronLogsTable)
    .orderBy(desc(cronLogsTable.ranAt))
    .limit(limit);

  res.json(logs.map(l => ({
    id: l.id,
    ran_at: l.ranAt.toISOString(),
    status: l.status,
    articles_scraped: l.articlesScraped,
    error_message: l.errorMessage,
  })));
});

// ---------------------------------------------------------------------------
// Endpoint: GET /cron/settings
// ---------------------------------------------------------------------------
router.get("/cron/settings", requireAdmin, async (_req, res): Promise<void> => {
  let [settings] = await db.select().from(cronSettingsTable).where(eq(cronSettingsTable.id, 1));

  if (!settings) {
    [settings] = await db.insert(cronSettingsTable).values({
      id: 1,
      enabled: false,
      targetUrls: "[]",
      runAt: "08:00",
    }).returning();
  }

  res.json({
    enabled: settings.enabled,
    target_urls: JSON.parse(settings.targetUrls) as string[],
    run_at: settings.runAt,
  });
});

// ---------------------------------------------------------------------------
// Endpoint: PATCH /cron/settings
// ---------------------------------------------------------------------------
router.patch("/cron/settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateCronSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof cronSettingsTable.$inferInsert> = {};
  if (parsed.data.enabled !== undefined) updateData.enabled = parsed.data.enabled;
  if (parsed.data.target_urls !== undefined) {
    const invalid = parsed.data.target_urls.filter((u) => !/^https?:\/\//i.test(u));
    if (invalid.length > 0) {
      res.status(400).json({ error: `URL harus diawali http:// atau https:// — ${invalid.join(", ")}` });
      return;
    }
    updateData.targetUrls = JSON.stringify(parsed.data.target_urls);
  }
  if (parsed.data.run_at !== undefined) {
    // Scheduler mencocokkan string "HH:mm" persis. Format lain (mis. "8:00"
    // atau "08:00:00") tidak akan pernah cocok, dan cron diam-diam tidak jalan.
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.data.run_at)) {
      res.status(400).json({ error: "run_at harus format HH:mm 24-jam, contoh 08:00" });
      return;
    }
    updateData.runAt = parsed.data.run_at;
  }

  const [settings] = await db.insert(cronSettingsTable)
    .values({ id: 1, enabled: false, targetUrls: "[]", runAt: "08:00", ...updateData })
    .onConflictDoUpdate({ target: cronSettingsTable.id, set: updateData })
    .returning();

  res.json({
    enabled: settings.enabled,
    target_urls: JSON.parse(settings.targetUrls) as string[],
    run_at: settings.runAt,
  });
});

// ---------------------------------------------------------------------------
// Endpoint: POST /cron/run  (admin manual trigger dari UI)
// ---------------------------------------------------------------------------
router.post("/cron/run", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const { articlesScraped, errors, skipped } = await runCronJob();

    if (skipped) {
      res.json({
        articles_scraped: 0,
        message: "Otomasi sedang nonaktif. Aktifkan dulu di halaman Automation.",
      });
      return;
    }

    const message =
      errors.length === 0
        ? `Cron selesai: ${articlesScraped} artikel berhasil diambil.`
        : `Cron selesai dengan ${errors.length} error: ${articlesScraped} artikel berhasil diambil.`;

    res.json({ articles_scraped: articlesScraped, message });
  } catch (err) {
    res.status(500).json({ error: `Cron gagal dijalankan: ${(err as Error).message}` });
  }
});

// ---------------------------------------------------------------------------
// Endpoint: POST /cron/trigger  (tanpa session auth — untuk Vercel Cron)
// ---------------------------------------------------------------------------
router.post("/cron/trigger", async (req, res): Promise<void> => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    res.status(503).json({ error: "CRON_SECRET belum dikonfigurasi" });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (token !== cronSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { articlesScraped } = await runCronJob();
    res.json({ articles_scraped: articlesScraped });
  } catch (err) {
    res.status(500).json({ error: `Cron gagal: ${(err as Error).message}` });
  }
});

export default router;
