import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cronLogsTable = pgTable("cron_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status", { enum: ["success", "error", "partial"] }).notNull(),
  articlesScraped: integer("articles_scraped").notNull().default(0),
  errorMessage: text("error_message"),
});

export const insertCronLogSchema = createInsertSchema(cronLogsTable).omit({ id: true });
export type InsertCronLog = z.infer<typeof insertCronLogSchema>;
export type CronLog = typeof cronLogsTable.$inferSelect;
