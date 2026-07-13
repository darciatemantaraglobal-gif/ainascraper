import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scraperDraftsTable = pgTable("scraper_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content").notNull(),
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
