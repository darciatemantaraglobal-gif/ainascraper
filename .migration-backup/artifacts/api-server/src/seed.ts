import bcrypt from "bcryptjs";
import { db, scraperUsersTable, scraperDraftsTable, cronSettingsTable } from "@workspace/db";

async function seed() {
  console.log("Seeding database...");

  // Create users
  const adminHash = await bcrypt.hash("admin123", 12);
  const contrib1Hash = await bcrypt.hash("kontributor123", 12);
  const contrib2Hash = await bcrypt.hash("kontributor123", 12);

  await db.insert(scraperUsersTable).values([
    { username: "admin", passwordHash: adminHash, role: "admin", dailyTarget: 10 },
    { username: "ahmad", passwordHash: contrib1Hash, role: "contributor", dailyTarget: 3 },
    { username: "fatimah", passwordHash: contrib2Hash, role: "contributor", dailyTarget: 3 },
  ]).onConflictDoNothing();

  // Create sample drafts
  await db.insert(scraperDraftsTable).values([
    {
      title: "Panduan Pendaftaran Kuliah di Al-Azhar University 2024",
      content: "Al-Azhar University merupakan salah satu universitas tertua dan paling bergengsi di dunia Islam. Bagi mahasiswa Indonesia yang ingin melanjutkan studi di Mesir, khususnya di Al-Azhar, terdapat beberapa jalur pendaftaran yang bisa ditempuh...",
      summary: "Panduan lengkap pendaftaran kuliah di Al-Azhar University untuk mahasiswa Indonesia, mencakup persyaratan dokumen, jadwal pendaftaran, dan tips sukses.",
      tags: "al-azhar, pendaftaran, beasiswa, mahasiswa, indonesia, mesir",
      category: "Pendidikan",
      sourceUrl: "https://example.com/al-azhar-guide",
      sourceType: "url",
      relevanceScore: 92,
      status: "submitted",
      submittedBy: "ahmad",
    },
    {
      title: "Harga Kebutuhan Pokok di Kairo Bulan Juli 2024",
      content: "Berdasarkan survei terbaru yang dilakukan oleh komunitas Masisir, harga kebutuhan pokok di Kairo mengalami kenaikan sekitar 15% dibandingkan bulan sebelumnya akibat fluktuasi nilai tukar pound Mesir...",
      summary: "Update harga sembako dan kebutuhan pokok di Kairo bulan Juli 2024, relevan untuk perencanaan keuangan mahasiswa Indonesia di Mesir.",
      tags: "kairo, harga, sembako, masisir, keuangan",
      category: "Kehidupan",
      sourceType: "manual",
      relevanceScore: 88,
      status: "draft",
      submittedBy: "fatimah",
    },
    {
      title: "Program Beasiswa LPDP untuk Studi di Timur Tengah",
      content: "LPDP membuka pendaftaran beasiswa untuk studi di universitas-universitas terkemuka di Timur Tengah, termasuk Mesir. Program ini mencakup biaya kuliah penuh, biaya hidup bulanan, dan tiket perjalanan...",
      summary: "Informasi program beasiswa LPDP untuk mahasiswa Indonesia yang ingin studi di Timur Tengah termasuk Mesir.",
      tags: "beasiswa, lpdp, timur tengah, mesir, studi",
      category: "Beasiswa",
      sourceType: "url",
      relevanceScore: 95,
      status: "approved",
      submittedBy: "ahmad",
    },
    {
      title: "Tips Bertahan Hidup sebagai Mahasiswa Baru di Kairo",
      content: "Menjadi mahasiswa baru di Kairo bisa terasa overwhelming. Dari masalah bahasa, budaya yang berbeda, hingga mencari tempat tinggal yang layak dengan budget yang terbatas...",
      summary: "Kumpulan tips praktis untuk mahasiswa Indonesia yang baru tiba di Kairo, mencakup tempat tinggal, transportasi, makanan, dan adaptasi budaya.",
      tags: "kairo, tips, mahasiswa baru, adaptasi, masisir",
      category: "Kehidupan",
      sourceType: "manual",
      relevanceScore: 85,
      status: "submitted",
      submittedBy: "fatimah",
    },
    {
      title: "Jadwal Agenda IMBASINDO 2024",
      content: "Ikatan Mahasiswa dan Pelajar Indonesia di Mesir (IMBASINDO) telah merilis jadwal agenda resmi untuk tahun 2024. Berbagai kegiatan sosial, budaya, dan akademik telah direncanakan...",
      summary: "Rangkuman agenda resmi IMBASINDO 2024 termasuk kegiatan sosial, budaya, dan akademik untuk komunitas Masisir.",
      tags: "imbasindo, agenda, masisir, organisasi, indonesia",
      category: "Organisasi",
      sourceType: "instagram",
      sourceUrl: "https://instagram.com/imbasindo",
      relevanceScore: 78,
      status: "draft",
      submittedBy: "ahmad",
    },
    {
      title: "Artikel Teknologi Tidak Relevan untuk Masisir",
      content: "Review smartphone terbaru dengan spesifikasi tinggi dan harga premium. Artikel ini membahas perbandingan chipset, kamera, dan fitur-fitur terkini...",
      summary: "Review smartphone premium terbaru.",
      tags: "teknologi, smartphone",
      category: "Teknologi",
      sourceType: "url",
      relevanceScore: 22,
      status: "rejected",
      submittedBy: "fatimah",
    },
  ]).onConflictDoNothing();

  // Seed cron settings
  await db.insert(cronSettingsTable).values({
    id: 1,
    enabled: true,
    targetUrls: JSON.stringify([
      "https://www.nu.or.id/internasional",
      "https://kemenag.go.id/berita",
    ]),
    runAt: "08:00",
  }).onConflictDoNothing();

  console.log("Seeding complete!");
}

seed().catch(console.error).finally(() => process.exit(0));
