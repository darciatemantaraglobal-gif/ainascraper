/**
 * Resolusi konfigurasi koneksi database.
 *
 * Kenapa file terpisah: drizzle.config.ts (drizzle-kit) dan src/index.ts (runtime)
 * dulunya punya logika berbeda, dan itu sumber bug — SSL cuma nyala kalau env-nya
 * kebetulan bernama SUPABASE_DB_URL. Sekarang keduanya pakai fungsi yang sama.
 */

export interface DbConfig {
  connectionString: string;
  ssl: boolean;
}

/**
 * SSL ditentukan dari ISI connection string, bukan dari NAMA env var.
 * - sslmode=disable / require / no-verify di query string menang duluan.
 * - Host non-lokal (Supabase, Neon, RDS, dll) default-nya butuh SSL.
 * - localhost / 127.0.0.1 default-nya tanpa SSL.
 */
export function needsSsl(connectionString: string): boolean {
  const explicit = /[?&]sslmode=([^&]+)/.exec(connectionString)?.[1];
  if (explicit) {
    return explicit !== "disable";
  }

  if (process.env.DB_SSL === "true") return true;
  if (process.env.DB_SSL === "false") return false;

  let host = "";
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return false;
  }

  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local");

  return !isLocal;
}

export function resolveDbConfig(): DbConfig {
  const connectionString =
    process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";

  if (!connectionString) {
    throw new Error(
      "Database connection string tidak ditemukan.\n" +
        "Set salah satu: SUPABASE_DB_URL atau DATABASE_URL.\n" +
        "Contoh Supabase (Session Pooler, port 5432):\n" +
        "  postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres",
    );
  }

  return { connectionString, ssl: needsSsl(connectionString) };
}

export interface DbDiagnostics {
  configured: boolean;
  host: string | null;
  port: number | null;
  ssl: boolean | null;
}

/**
 * Sama seperti resolveDbConfig(), tapi TIDAK PERNAH throw dan TIDAK PERNAH
 * membocorkan credential — cuma host/port/ssl. Dipakai di endpoint
 * diagnostik (/healthz/deep) dan log startup, yang harus tetap jalan
 * walau connection string belum di-set.
 */
export function describeDbConfig(): DbDiagnostics {
  const connectionString =
    process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";

  if (!connectionString) {
    return { configured: false, host: null, port: null, ssl: null };
  }

  try {
    const url = new URL(connectionString);
    return {
      configured: true,
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432,
      ssl: needsSsl(connectionString),
    };
  } catch {
    return { configured: true, host: null, port: null, ssl: null };
  }
}
