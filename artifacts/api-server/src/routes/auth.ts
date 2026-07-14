import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, scraperUsersTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { createToken } from "../lib/token";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;

  // Query DB dibungkus try/catch: kalau DB down, ini HARUS balas 503 yang
  // jelas ("Database tidak bisa diakses"), bukan 500 generik yang nyamar
  // sama dengan kegagalan session di bawah — dua penyebab beda, dua respons
  // beda, biar debugging production tidak menembak arah yang salah.
  let user: typeof scraperUsersTable.$inferSelect | undefined;
  try {
    [user] = await db.select().from(scraperUsersTable).where(eq(scraperUsersTable.username, username));
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    req.log?.error({ err, pgCode: pgErr.code }, "[login] Query user gagal — DB kemungkinan down");
    res.status(503).json({ error: "Database tidak bisa diakses.", code: "DB_UNAVAILABLE" });
    return;
  }

  if (!user) {
    // Jangan bocorkan apakah username ada atau tidak.
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const authed = { username: user.username, role: user.role as "contributor" | "admin" };
  const token = createToken(authed);

  // FE sudah pakai bearer token sebagai jalur utama (lihat
  // src/lib/auth-token.ts + AuthContext) — session cookie cuma jalur
  // kedua. Kegagalan session TIDAK BOLEH menjatuhkan login: kalau
  // regenerate()/save() error, log warning dan tetap balas 200 dengan
  // `sessionPersisted: false`, supaya FE tahu tapi user tetap bisa masuk.
  req.session.regenerate((regenerateErr) => {
    if (regenerateErr) {
      req.log?.warn({ err: regenerateErr }, "[login] session.regenerate gagal — lanjut dengan bearer token saja");
      res.json({ ...authed, token, sessionPersisted: false });
      return;
    }

    req.session.user = authed;
    req.session.save((saveErr) => {
      if (saveErr) {
        req.log?.warn({ err: saveErr }, "[login] session.save gagal — lanjut dengan bearer token saja");
        res.json({ ...authed, token, sessionPersisted: false });
        return;
      }

      res.json({ ...authed, token, sessionPersisted: true });
    });
  });
});

router.post("/auth/logout", (req, res): void => {
  // Token bearer bersifat stateless — FE wajib membuangnya sendiri dari storage.
  if (!req.session) {
    res.json({ ok: true });
    return;
  }

  req.session.destroy(() => {
    res.clearCookie("aina.sid");
    res.json({ ok: true });
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  res.json({ username: req.user!.username, role: req.user!.role });
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const { old_password, new_password, confirm_password } = req.body as {
    old_password?: string;
    new_password?: string;
    confirm_password?: string;
  };

  if (!old_password || !new_password || !confirm_password) {
    res.status(400).json({ error: "Semua field wajib diisi." });
    return;
  }

  // 1. Cek konfirmasi password
  if (confirm_password !== new_password) {
    res.status(400).json({ error: "Konfirmasi password tidak sama." });
    return;
  }

  // 2. Ambil user dari DB
  const [user] = await db
    .select()
    .from(scraperUsersTable)
    .where(eq(scraperUsersTable.username, req.user!.username));

  if (!user) {
    res.status(404).json({ error: "User tidak ditemukan." });
    return;
  }

  // 3. Verifikasi password lama
  const valid = await bcrypt.compare(old_password, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Password lama tidak sesuai." });
    return;
  }

  // 4. Hash password baru
  const newHash = await bcrypt.hash(new_password, 10);

  // 5. Update di DB
  await db
    .update(scraperUsersTable)
    .set({ passwordHash: newHash })
    .where(eq(scraperUsersTable.username, req.user!.username));

  res.json({ message: "Password berhasil diubah." });
});

export default router;
