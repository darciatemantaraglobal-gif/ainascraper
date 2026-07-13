/**
 * Schema yang BOLEH disentuh drizzle-kit (push / generate).
 *
 * BUG YANG DIPERBAIKI:
 * drizzle.config.ts dulu menunjuk ke ./src/schema/index.ts, yang meng-export
 * knowledgeBaseTable juga. `tablesFilter` HANYA menyaring tabel saat drizzle-kit
 * meng-introspeksi database — bukan menyaring schema TypeScript-nya.
 *
 * Akibatnya:
 *   - drizzle-kit melihat knowledge_base di schema TS (schema yang diinginkan)
 *   - drizzle-kit TIDAK melihatnya di hasil introspeksi (kesaring tablesFilter)
 *   - kesimpulannya: "tabel ini belum ada" -> CREATE TABLE knowledge_base
 *   - Postgres: ERROR 42P07 relation "knowledge_base" already exists
 *
 * -> `pnpm --filter @workspace/db push` SELALU gagal di Supabase.
 *
 * Solusinya: pisahkan schema yang dikelola drizzle-kit dari barrel runtime.
 * Runtime (src/index.ts) tetap memakai ./schema lengkap, karena route memang
 * perlu MEMBACA/MENULIS knowledge_base — cuma tidak boleh ikut ter-migrate.
 */
export * from "./scraperUsers";
export * from "./scraperDrafts";
export * from "./cronLogs";
export * from "./cronSettings";
