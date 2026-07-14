import { Router, type IRouter } from "express";
import { eq, count } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, scraperUsersTable, scraperDraftsTable } from "@workspace/db";
import { CreateUserBody, UpdateUserBody, UpdateUserParams, DeleteUserParams } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select().from(scraperUsersTable);
  const draftCounts = await db.select({
    username: scraperDraftsTable.submittedBy,
    total: count(),
  }).from(scraperDraftsTable).groupBy(scraperDraftsTable.submittedBy);

  const countMap = new Map(draftCounts.map(d => [d.username, d.total]));

  res.json(users.map(u => ({
    username: u.username,
    role: u.role,
    total_drafts: countMap.get(u.username) ?? 0,
    daily_target: u.dailyTarget,
  })));
});

router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(scraperUsersTable).where(eq(scraperUsersTable.username, parsed.data.username));
  if (existing.length > 0) {
    res.status(409).json({ error: "Username sudah digunakan." });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const [user] = await db.insert(scraperUsersTable).values({
    username: parsed.data.username,
    passwordHash,
    role: parsed.data.role as "contributor" | "admin",
    dailyTarget: parsed.data.daily_target ?? 3,
  }).returning();

  res.status(201).json({
    username: user.username,
    role: user.role,
    total_drafts: 0,
    daily_target: user.dailyTarget,
  });
});

router.patch("/users/:username", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof scraperUsersTable.$inferInsert> = {};
  if (parsed.data.role) updateData.role = parsed.data.role as "contributor" | "admin";
  if (parsed.data.password) updateData.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  if (parsed.data.daily_target !== undefined) updateData.dailyTarget = parsed.data.daily_target;

  const [user] = await db.update(scraperUsersTable)
    .set(updateData)
    .where(eq(scraperUsersTable.username, params.data.username))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    username: user.username,
    role: user.role,
    total_drafts: 0,
    daily_target: user.dailyTarget,
  });
});

router.post("/users/:username/reset-password", requireAdmin, async (req, res): Promise<void> => {
  const username = req.params.username as string;

  const [user] = await db.select().from(scraperUsersTable).where(eq(scraperUsersTable.username, username as string));
  if (!user) {
    res.status(404).json({ error: "User tidak ditemukan." });
    return;
  }

  // Generate password baru acak 12 karakter (huruf + angka)
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const { randomBytes } = await import("crypto");
  const bytes = randomBytes(12);
  let newPassword = "";
  for (let i = 0; i < 12; i++) {
    newPassword += charset[bytes[i]! % charset.length];
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await db.update(scraperUsersTable)
    .set({ passwordHash: newHash })
    .where(eq(scraperUsersTable.username, username as string));

  // Plain text hanya dikembalikan sekali ke admin — tidak disimpan di server
  res.json({ username, new_password: newPassword });
});

router.delete("/users/:username", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Cegah admin menghapus akunnya sendiri
  if (params.data.username === req.user!.username) {
    res.status(400).json({ error: "Tidak bisa menghapus akun sendiri." });
    return;
  }

  const [user] = await db.delete(scraperUsersTable)
    .where(eq(scraperUsersTable.username, params.data.username))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User tidak ditemukan." });
    return;
  }

  res.sendStatus(204);
});

export default router;
