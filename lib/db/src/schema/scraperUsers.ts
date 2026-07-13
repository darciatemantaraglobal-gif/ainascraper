import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scraperUsersTable = pgTable("scraper_users", {
  username: text("username").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["contributor", "admin"] }).notNull(),
  dailyTarget: integer("daily_target").notNull().default(3),
});

export const insertScraperUserSchema = createInsertSchema(scraperUsersTable);
export type InsertScraperUser = z.infer<typeof insertScraperUserSchema>;
export type ScraperUser = typeof scraperUsersTable.$inferSelect;
