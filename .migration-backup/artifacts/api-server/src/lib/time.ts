/**
 * Batas "hari ini" harus mengikuti zona waktu tim (Kairo), bukan zona server.
 *
 * BUG SEBELUMNYA: stats.ts pakai `new Date(y, m, d)` = tengah malam LOCAL server.
 * Container Railway/Docker jalan di UTC, jadi "hari ini" reset jam 02:00 pagi
 * waktu Kairo. Target harian kontributor jadi ke-reset di tengah malam yang salah.
 *
 * Set env APP_TZ (default Africa/Cairo) untuk mengatur ini.
 */
const APP_TZ = process.env.APP_TZ ?? "Africa/Cairo";

/** Ambil komponen tanggal (Y/M/D) sebagaimana terlihat di zona waktu APP_TZ. */
function partsInTz(date: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const [year, month, day] = fmt.format(date).split("-").map(Number) as [
    number,
    number,
    number,
  ];

  return { year, month, day };
}

/** Offset zona waktu APP_TZ terhadap UTC, dalam milidetik, pada saat `date`. */
function tzOffsetMs(date: Date): number {
  const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const local = new Date(date.toLocaleString("en-US", { timeZone: APP_TZ }));
  return local.getTime() - utc.getTime();
}

/** Instant UTC yang setara dengan tengah malam hari ini di APP_TZ. */
export function startOfTodayInAppTz(now: Date = new Date()): Date {
  const { year, month, day } = partsInTz(now);
  const midnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  return new Date(midnightAsUtc - tzOffsetMs(now));
}

/** Instant UTC yang setara dengan tanggal 1 bulan ini, tengah malam, di APP_TZ. */
export function startOfMonthInAppTz(now: Date = new Date()): Date {
  const { year, month } = partsInTz(now);
  const firstAsUtc = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
  return new Date(firstAsUtc - tzOffsetMs(now));
}
