/**
 * Script darurat: upsert user admin lewat env, dipakai kalau row admin di
 * DB rusak / lupa password dan approve/login jadi macet total.
 *
 * Jalankan manual (bukan lewat HTTP): habis build, panggil
 *   node dist/src/reset-admin.mjs
 * dengan ADMIN_USERNAME & ADMIN_PASSWORD di-set di env.
 */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, scraperUsersTable } from "@workspace/db";

async function resetAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error(
      "ADMIN_USERNAME dan ADMIN_PASSWORD wajib di-set.\n" +
        "Contoh: ADMIN_USERNAME=admin ADMIN_PASSWORD=... node dist/src/reset-admin.mjs",
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db
    .insert(scraperUsersTable)
    .values({ username, passwordHash, role: "admin" })
    .onConflictDoUpdate({
      target: scraperUsersTable.username,
      set: { passwordHash, role: "admin", dailyTarget: sql`10` },
    });

  console.log(`User admin "${username}" berhasil di-reset.`);
}

resetAdmin()
  .catch((err) => {
    console.error("Gagal reset admin:", err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
