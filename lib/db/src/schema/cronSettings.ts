import { pgTable, text, boolean, integer } from "drizzle-orm/pg-core";

// Single-row settings table
export const cronSettingsTable = pgTable("cron_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: boolean("enabled").notNull().default(false),
  targetUrls: text("target_urls").notNull().default("[]"), // JSON stringified array
  runAt: text("run_at").notNull().default("08:00"),
});

export type CronSettings = typeof cronSettingsTable.$inferSelect;
