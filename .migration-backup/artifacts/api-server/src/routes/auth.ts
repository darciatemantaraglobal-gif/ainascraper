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
  const [user] = await db.select().from(scraperUsersTable).where(eq(scraperUsersTable.username, username));

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const authed = { username: user.username, role: user.role as "contributor" | "admin" };

  // Jalur 1: session cookie (dipakai kalau same-site / cookie tidak diblokir).
  // Jalur 2: bearer token — disimpan FE, dikirim via header Authorization.
  //          Ini yang bikin login tetap jalan di Safari/Brave yang blokir
  //          third-party cookie.
  // regenerate() dipanggil dulu untuk mencegah session fixation.
  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: "Gagal membuat sesi." });
      return;
    }

    req.session.user = authed;
    req.session.save(() => {
      res.json({ ...authed, token: createToken(authed) });
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
