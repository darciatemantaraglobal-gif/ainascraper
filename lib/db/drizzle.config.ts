import { defineConfig } from "drizzle-kit";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDbConfig } from "./src/config";

const here = path.dirname(fileURLToPath(import.meta.url));
const { connectionString, ssl } = resolveDbConfig();

export default defineConfig({
  // Menunjuk ke managed.ts, BUKAN index.ts. knowledge_base dimiliki aplikasi
  // AINA yang lain — drizzle-kit tidak boleh membuat/mengubah/menghapusnya.
  schema: path.join(here, "./src/schema/managed.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : false,
  },
  // Sabuk pengaman kedua: walau schema-nya sudah dibatasi di atas, filter ini
  // memastikan drizzle-kit tidak pernah mengusulkan DROP untuk tabel lain
  // (knowledge_base, tabel Supabase auth, dll) yang ada di database.
  tablesFilter: ["scraper_users", "scraper_drafts", "cron_logs", "cron_settings"],
});
