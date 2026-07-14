/**
 * Scheduler in-process.
 *
 * BUG YANG DIPERBAIKI: kolom `run_at` di cron_settings bisa diatur lewat UI
 * (halaman Automation), tapi TIDAK ADA satu pun kode di repo yang membacanya
 * untuk menjadwalkan apa pun. Jadi jam yang dipilih admin cuma dekorasi —
 * cron tidak pernah jalan sendiri.
 *
 * Karena API server sekarang long-lived (Railway, bukan serverless), kita bisa
 * menjadwalkannya di dalam proses: cek tiap menit, jalankan saat jam lokal
 * (APP_TZ) cocok dengan run_at, maksimal sekali per hari.
 *
 * CATATAN SCALING: kalau nanti kamu menaikkan replica > 1, matikan ini
 * (ENABLE_SCHEDULER=false) dan pakai scheduler eksternal yang memanggil
 * POST /api/cron/trigger, supaya job tidak jalan dobel.
 */
import { eq } from "drizzle-orm";
import { db, cronSettingsTable } from "@workspace/db";
import { runCronJob } from "./cronRunner";
import { logger } from "./logger";

const APP_TZ = process.env.APP_TZ ?? "Africa/Cairo";

/** "YYYY-MM-DD HH:mm" menurut APP_TZ. */
function nowInAppTz(): { day: string; hhmm: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));

  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hhmm: `${parts.hour}:${parts.minute}`,
  };
}

let lastRunDay: string | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return; // cegah tumpang-tindih kalau job sebelumnya masih jalan

  const { day, hhmm } = nowInAppTz();
  if (lastRunDay === day) return;

  const [settings] = await db
    .select()
    .from(cronSettingsTable)
    .where(eq(cronSettingsTable.id, 1));

  if (!settings?.enabled) return;
  if (settings.runAt !== hhmm) return;

  lastRunDay = day;
  running = true;

  logger.info({ runAt: settings.runAt, tz: APP_TZ }, "[scheduler] Menjalankan cron job");

  try {
    const result = await runCronJob();
    logger.info(result, "[scheduler] Cron job selesai");
  } catch (err) {
    logger.error({ err }, "[scheduler] Cron job gagal");
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  if (process.env.ENABLE_SCHEDULER === "false") {
    logger.info("[scheduler] Dinonaktifkan (ENABLE_SCHEDULER=false)");
    return;
  }

  logger.info({ tz: APP_TZ }, "[scheduler] Aktif, cek tiap menit");

  setInterval(() => {
    void tick().catch((err) => logger.error({ err }, "[scheduler] tick error"));
  }, 60_000).unref();
}
