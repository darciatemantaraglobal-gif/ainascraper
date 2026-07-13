import { pgTable, text, integer, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scraperDraftsTable = pgTable("scraper_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content").notNull(),

  /**
   * Teks ASLI hasil scraping, sebelum dirapikan AI.
   *
   * KENAPA WAJIB ADA: kalau "Rapikan otomatis" aktif, AI menimpa `content`.
   * Tanpa salinan mentah ini, teks asli HILANG SELAMANYA — dan kalau AI
   * diam-diam membuang biaya/alamat/syarat dokumen, tidak ada yang bisa
   * mengeceknya lagi. Kontributor bisa membandingkan lewat tombol
   * "Lihat teks asli" di editor draft.
   *
   * NULL berarti draft ini tidak pernah dirapikan (content = teks asli).
   */
  rawContent: text("raw_content"),

  /** true kalau `content` adalah hasil tulisan ulang AI, bukan teks scrape mentah. */
  aiFormatted: boolean("ai_formatted").notNull().default(false),
  summary: text("summary"),
  tags: text("tags"),
  category: text("category"),
  sourceUrl: text("source_url"),
  sourceType: text("source_type", { enum: ["url", "manual", "pdf", "instagram", "auto"] }).notNull(),
  relevanceScore: integer("relevance_score").notNull().default(0),
  status: text("status", { enum: ["draft", "submitted", "approved", "rejected"] }).notNull().default("draft"),
  submittedBy: text("submitted_by").notNull(),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertScraperDraftSchema = createInsertSchema(scraperDraftsTable).omit({ id: true, createdAt: true });
export type InsertScraperDraft = z.infer<typeof insertScraperDraftSchema>;
export type ScraperDraft = typeof scraperDraftsTable.$inferSelect;
