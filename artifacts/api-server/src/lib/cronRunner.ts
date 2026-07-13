/**
 * Eksekusi satu siklus cron scraping.
 *
 * Dipindah keluar dari routes/cron.ts supaya bisa dipakai oleh:
 *   - POST /api/cron/run      (trigger manual admin)
 *   - POST /api/cron/trigger  (scheduler eksternal + CRON_SECRET)
 *   - scheduler in-process    (lib/scheduler.ts)
 */
import { eq } from "drizzle-orm";
import { db, cronLogsTable, cronSettingsTable, scraperDraftsTable } from "@workspace/db";
import { analyzeWithOpenRouter, fetchAndExtractUrl } from "./scrapeUtils";
import { logger } from "./logger";

export interface CronResult {
  articlesScraped: number;
  errors: string[];
  skipped: boolean;
}

export async function runCronJob(): Promise<CronResult> {
  const [settings] = await db
    .select()
    .from(cronSettingsTable)
    .where(eq(cronSettingsTable.id, 1));

  if (!settings || !settings.enabled) {
    return { articlesScraped: 0, errors: [], skipped: true };
  }

  let targetUrls: string[];
  try {
    const parsed: unknown = JSON.parse(settings.targetUrls);
    targetUrls = Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : [];
  } catch {
    // targetUrls korup di DB -> jangan sampai crash seluruh cron.
    await db.insert(cronLogsTable).values({
      status: "error",
      articlesScraped: 0,
      errorMessage: "target_urls di cron_settings bukan JSON array yang valid.",
    });
    return { articlesScraped: 0, errors: ["invalid target_urls"], skipped: false };
  }

  if (targetUrls.length === 0) {
    await db.insert(cronLogsTable).values({
      status: "success",
      articlesScraped: 0,
      errorMessage: "Tidak ada URL target yang dikonfigurasi.",
    });
    return { articlesScraped: 0, errors: [], skipped: false };
  }

  let articlesScraped = 0;
  const errors: string[] = [];

  for (const url of targetUrls) {
    try {
      const { title, text } = await fetchAndExtractUrl(url);
      const { summary, tags, relevanceScore } = await analyzeWithOpenRouter(text, title);
      const status = relevanceScore <= 50 ? "rejected" : "draft";

      await db.insert(scraperDraftsTable).values({
        title,
        content: text.substring(0, 8000),
        summary,
        tags,
        sourceUrl: url,
        sourceType: "auto",
        relevanceScore,
        status,
        submittedBy: "cron",
      });

      articlesScraped++;
    } catch (err) {
      const msg = `${url}: ${(err as Error).message}`;
      errors.push(msg);
      logger.error({ url, err }, "[cron] Gagal scrape URL");
    }
  }

  const logStatus =
    errors.length === 0 ? "success" : articlesScraped === 0 ? "error" : "partial";

  await db.insert(cronLogsTable).values({
    status: logStatus,
    articlesScraped,
    errorMessage: errors.length > 0 ? errors.join(" | ").substring(0, 4000) : null,
  });

  return { articlesScraped, errors, skipped: false };
}
