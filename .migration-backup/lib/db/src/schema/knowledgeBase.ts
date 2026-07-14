import { pgTable, text, uuid, timestamp, integer, boolean, varchar, vector } from "drizzle-orm/pg-core";

/**
 * Tabel `knowledge_base` DIMILIKI oleh aplikasi AINA, bukan oleh scraper ini.
 * Definisi di bawah HARUS mencerminkan tabel yang sudah ada di produksi
 * (312 artikel live). Jangan mengubahnya sembarangan.
 *
 * Tabel ini SENGAJA tidak diekspor dari schema/managed.ts, sehingga
 * `drizzle-kit push` tidak akan pernah membuat/mengubah/menghapusnya.
 *
 * Constraint penting yang WAJIB dipenuhi saat insert:
 *   - author_id     NOT NULL, tanpa default  -> pakai env SCRAPER_AUTHOR_ID
 *   - category      NOT NULL, tanpa default  -> harus salah satu KB_CATEGORIES
 *   - content       NOT NULL
 *   - article_type  NOT NULL, default 'narrative'
 *   - status        NOT NULL, default 'pending'
 *   - embedding     vector(512) — BUKAN text/JSON. Model: voyage-3-lite.
 */
export const knowledgeBaseTable = pgTable("knowledge_base", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorId: uuid("author_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  articleType: text("article_type").notNull().default("narrative"),
  voteCount: integer("vote_count"),
  hidden: boolean("hidden"),
  mapsUrl: text("maps_url"),
  keywords: text("keywords"),
  summary: text("summary"),
  importantNotes: text("important_notes"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }),
  embedding: vector("embedding", { dimensions: 512 }),
  contentAr: text("content_ar"),
  contactNumber: text("contact_number"),
  embeddingModel: varchar("embedding_model"),
  imageUrl: text("image_url"),
});

export type KnowledgeBase = typeof knowledgeBaseTable.$inferSelect;
export type InsertKnowledgeBase = typeof knowledgeBaseTable.$inferInsert;

/**
 * Kategori yang VALID di knowledge_base AINA (diambil dari data produksi).
 * Kolom `category` NOT NULL, jadi insert wajib memilih salah satu dari ini.
 */
export const KB_CATEGORIES = [
  "Akademik",
  "Kehidupan Mesir",
  "Administrasi",
  "Bahasa",
  "Tempat Tinggal",
  "Transport",
] as const;

export type KbCategory = (typeof KB_CATEGORIES)[number];

/** Dipakai kalau klasifikasi AI gagal — kategori terbanyak di produksi. */
export const KB_DEFAULT_CATEGORY: KbCategory = "Akademik";

/**
 * Dimensi embedding di PRODUKSI. JANGAN DIUBAH tanpa re-embed 313 artikel lama.
 *
 * Diverifikasi langsung dari DB, bukan asumsi:
 *   SELECT embedding_model, vector_dims(embedding), count(*)
 *   FROM knowledge_base WHERE embedding IS NOT NULL GROUP BY 1,2;
 *   -> voyage-3-lite | 512 | 313
 *
 * Versi lama menulis 1536 (OpenAI text-embedding-3-large). Akibatnya:
 *   - dedupe: `embedding <=> $1::vector` -> "different vector dimensions 512 and 1536"
 *     -> throw -> HTTP 500 di /scrape/url & /scrape/instagram
 *   - approve: UPDATE embedding gagal, error ditelan .catch() fire-and-forget
 *     -> artikel masuk KB dengan embedding NULL -> tidak pernah muncul di AINA
 */
export const KB_EMBEDDING_DIMENSIONS = 512;
