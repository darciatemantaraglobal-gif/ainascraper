/**
 * Validasi environment variable sekali di startup, biar gagalnya jelas
 * dan cepat — bukan 500 misterius jam 3 pagi.
 */
export const isProduction = process.env.NODE_ENV === "production";

function requiredInProduction(name: string, fallback: string): string {
  const value = process.env[name];

  if (!value) {
    if (isProduction) {
      throw new Error(
        `${name} wajib di-set di production. Generate dengan:\n` +
          `  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
      );
    }
    return fallback;
  }

  return value;
}

/** Dipakai untuk menandatangani session cookie DAN bearer token. */
export const SESSION_SECRET = requiredInProduction(
  "SESSION_SECRET",
  "aina-dev-secret-change-in-production",
);

/**
 * Daftar origin yang boleh memanggil API, dipisah koma.
 * Contoh: "https://aina-scraper.vercel.app,http://localhost:5173"
 * Kalau kosong di development, semua origin diizinkan.
 */
export const CORS_ORIGINS: string[] = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

/**
 * Set ini HANYA kalau FE dan BE berbagi parent domain
 * (misal app.aina.id + api.aina.id -> COOKIE_DOMAIN=".aina.id").
 * Kalau di-set, cookie jadi same-site -> SameSite=Lax aman & tahan ITP Safari.
 * Kalau tidak di-set, cookie dipaksa SameSite=None (butuh HTTPS, dan bisa
 * diblokir Safari/Brave — makanya kita juga menyediakan bearer token).
 */
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

export const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS ?? 7 * 24 * 60 * 60);

/**
 * Dipakai untuk melindungi endpoint tanpa session auth (cron trigger,
 * /healthz/deep). Sengaja opsional — kalau kosong, endpoint terkait
 * jatuh ke perilaku default masing-masing (lihat pemakainya).
 */
export const CRON_SECRET = process.env.CRON_SECRET || undefined;

/**
 * UUID penulis untuk artikel yang masuk ke knowledge_base dari scraper.
 *
 * Kolom `author_id` di knowledge_base bersifat NOT NULL tanpa default, jadi
 * insert WAJIB menyertakannya. Pakai UUID akun sistem/admin AINA — nilai yang
 * sama yang dipakai 312 artikel yang sudah ada.
 *
 * Cari nilainya dengan:
 *   SELECT author_id, count(*) FROM knowledge_base GROUP BY 1 ORDER BY 2 DESC;
 */
/**
 * Divalidasi lazily (saat dipakai, bukan saat startup) supaya server tetap
 * bisa boot ketika secret ini belum di-set — tapi approve tetap gagal
 * dengan pesan jelas, bukan silent fallback ke UUID palsu.
 */
export function getScraperAuthorId(): string {
  const value = process.env["SCRAPER_AUTHOR_ID"];

  if (!value) {
    throw new Error(
      "SCRAPER_AUTHOR_ID wajib di-set. Tanpa ini, setiap approve akan gagal " +
        "karena knowledge_base.author_id NOT NULL.\n" +
        "Ambil nilainya di Supabase:\n" +
        "  SELECT author_id, count(*) FROM knowledge_base GROUP BY 1 ORDER BY 2 DESC;",
    );
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`SCRAPER_AUTHOR_ID bukan UUID yang valid: "${value}"`);
  }

  return value;
}
