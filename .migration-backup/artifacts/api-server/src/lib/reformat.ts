/**
 * Merapikan hasil scraping menjadi artikel siap-pakai untuk knowledge_base AINA.
 *
 * PRINSIP UTAMA — belajar dari data asli, bukan dari asumsi:
 *
 * AINA sudah punya 312 artikel yang TERBUKTI dipakai dan lolos review. Alih-alih
 * mengarang "format ideal" sendiri, kita AMBIL beberapa artikel asli dari
 * knowledge_base pada kategori yang sama, lalu memakainya sebagai CONTOH GAYA
 * (few-shot) di dalam prompt.
 *
 * Hasilnya: artikel baru otomatis mengikuti gaya rumah AINA — panjangnya,
 * struktur headingnya, cara mengisi summary & keywords — tanpa kita perlu
 * menebak-nebak.
 */
import { and, eq, isNotNull, sql, ne } from "drizzle-orm";
import { db, knowledgeBaseTable, type KbCategory } from "@workspace/db";
import { OPENROUTER_MODEL, classifyKbCategory } from "./scrapeUtils";
import { logger } from "./logger";

/** Gaya penulisan yang bisa dipilih kontributor. */
export const REFORMAT_STYLES = ["auto", "points", "narrative", "faq"] as const;
export type ReformatStyle = (typeof REFORMAT_STYLES)[number];

export interface ReformatResult {
  title: string;
  /** Markdown siap tayang. */
  content: string;
  summary: string;
  /** Dipisah koma. */
  keywords: string;
  /** Hal penting/peringatan; boleh kosong. */
  important_notes: string;
  category: KbCategory;
  style_used: Exclude<ReformatStyle, "auto">;
  /** Contoh artikel KB yang dipakai sebagai acuan gaya. */
  style_examples: string[];
  /** false = AI gagal, hasil hanya dibersihkan seadanya. */
  ai_used: boolean;
}

const STYLE_INSTRUCTIONS: Record<Exclude<ReformatStyle, "auto">, string> = {
  points: `Tulis sebagai POIN-POIN RINGKAS.
- Kelompokkan dengan heading "## " bila ada beberapa topik.
- Gunakan daftar berpoin ("- ") untuk fakta, syarat, langkah, biaya.
- Tebalkan angka penting: **150 EGP**, **3 bulan**.
- Hindari kalimat panjang. Satu poin = satu informasi.`,

  narrative: `Tulis sebagai PARAGRAF NARATIF yang mengalir, seperti artikel berita.
- Paragraf pendek (2-4 kalimat).
- Pakai heading "## " untuk memisahkan bagian.
- Boleh menyelipkan daftar berpoin bila memang berupa daftar (syarat, biaya).
- Nada informatif dan netral, bukan promosi.`,

  faq: `Tulis sebagai TANYA-JAWAB.
- Setiap pertanyaan jadi heading "## " dan ditulis seperti yang benar-benar
  ditanyakan mahasiswa. Contoh: "## Berapa biaya perpanjangan iqamah?"
- Jawaban langsung ke inti, singkat dan konkret.
- Buat 3-8 pasang tanya-jawab.`,
};

/** Ambil artikel KB asli sebagai contoh gaya penulisan. */
async function fetchStyleExamples(
  category: KbCategory,
  limit = 2,
): Promise<{ title: string; content: string; summary: string; keywords: string }[]> {
  const rows = await db
    .select({
      title: knowledgeBaseTable.title,
      content: knowledgeBaseTable.content,
      summary: knowledgeBaseTable.summary,
      keywords: knowledgeBaseTable.keywords,
    })
    .from(knowledgeBaseTable)
    .where(
      and(
        eq(knowledgeBaseTable.category, category),
        ne(knowledgeBaseTable.status, "rejected"),
        isNotNull(knowledgeBaseTable.content),
        // Ambil yang panjangnya wajar — bukan potongan yang terlalu pendek.
        sql`length(${knowledgeBaseTable.content}) between 300 and 4000`,
      ),
    )
    // Artikel terbaru = paling mencerminkan gaya terkini.
    .orderBy(sql`${knowledgeBaseTable.createdAt} DESC`)
    .limit(limit);

  return rows.map((r) => ({
    title: r.title ?? "",
    content: r.content,
    summary: r.summary ?? "",
    keywords: r.keywords ?? "",
  }));
}

/**
 * Buang sampah khas hasil scraping web.
 *
 * ATURAN EMAS: LEBIH BAIK MENYISAKAN SAMPAH DARIPADA MEMBUANG ISI.
 *
 * Versi pertama fungsi ini menghapus SELURUH BARIS yang diawali kata sampah
 * seperti "Share:". Akibatnya baris:
 *
 *   "Share: informatikamesir.net, Kairo — Masisir sebagai orang terdidik..."
 *
 * ikut terhapus — padahal itu PARAGRAF PEMBUKA artikelnya. Isi asli hilang.
 *
 * Sekarang:
 *   - Baris hanya dihapus kalau SELURUH ISINYA memang sampah (dan pendek).
 *   - Untuk pola berawalan seperti "Share:", hanya PREFIKSNYA yang dipotong,
 *     sisanya (isi asli) dipertahankan.
 */
export function stripScrapeNoise(text: string): string {
  // 1. Prefiks yang dipotong SAJA — sisa barisnya tetap dipakai.
  const prefixes: RegExp[] = [
    /^\s*share\s*:\s*/gim,
    /^\s*bagikan\s*:\s*/gim,
    /^\s*(tags?|kategori|categories)\s*:\s*/gim,
  ];

  // 2. Baris yang dihapus SELURUHNYA — hanya kalau memang cuma sampah.
  //    Dibatasi panjangnya supaya tidak menelan paragraf asli.
  const junkLines: RegExp[] = [
    /^\s*(categories|home|berita terkini|beranda|menu|navigation)\s*$/gim,
    /^\s*(facebook|twitter|x|whatsapp|telegram|linkedin|pinterest|instagram|copy link)\s*$/gim,
    /^\s*\d+\s*$/gm,                                              // angka nyasar ("0", "490")
    /^\s*\d+\s*(views?|dilihat|komentar|comments?|likes?)\s*$/gim,
    /^\s*(by|oleh)\s+[\p{L}\s.'-]{3,40}\s*[-–—]\s*\d{1,2}\/\d{1,2}\/\d{2,4}.*$/gimu,
    /^\s*(baca juga|artikel terkait|related posts?|lihat juga)\s*:?.{0,120}$/gim,
    /^\s*(previous|next|sebelumnya|selanjutnya)\s+(article|post|artikel)?\s*:?.{0,120}$/gim,
    /^\s*copyright\s+.{0,80}$/gim,
    /^\s*(all rights reserved|hak cipta dilindungi).{0,60}$/gim,
  ];

  let out = text;

  for (const re of prefixes) out = out.replace(re, "");
  for (const re of junkLines) out = out.replace(re, "");

  // 3. Judul yang tercetak DUA KALI berdempetan (khas template CMS):
  //    "Judul ArtikelJudul Artikel" -> "Judul Artikel"
  //    Tidak di-anchor ke awal baris, karena sering didahului breadcrumb.
  out = out.replace(/(.{20,120}?)\1/gi, "$1");

  // 4. Breadcrumb navigasi di PALING AWAL teks: "Categories Home Berita Terkini ".
  //    Hanya dipotong di awal dokumen, dan hanya kata-kata navigasi yang dikenal —
  //    jadi tidak mungkin memakan kalimat asli di tengah artikel.
  // Tanda "+" penting: breadcrumb biasanya BERANTAI
  // ("Categories Home Berita Terkini ..."), jadi harus dipotong berulang
  // sampai habis, bukan sekali saja.
  out = out.replace(
    /^\s*(?:(?:categories|category|home|beranda|menu|berita terkini|berita|artikel|news)\s+)+/i,
    "",
  );

  return out
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

function pickStyle(style: ReformatStyle, content: string): Exclude<ReformatStyle, "auto"> {
  if (style !== "auto") return style;

  const t = content.toLowerCase();

  // Banyak angka/harga/syarat -> lebih enak dibaca sebagai poin.
  const listySignals =
    (t.match(/\b(syarat|biaya|harga|langkah|dokumen|jadwal|egp|le|rp)\b/g) ?? []).length;

  // Banyak pertanyaan -> FAQ.
  const questionSignals = (t.match(/\?/g) ?? []).length;

  if (questionSignals >= 3) return "faq";
  if (listySignals >= 4) return "points";
  return "narrative";
}

export async function reformatForAina(opts: {
  title: string;
  content: string;
  style?: ReformatStyle;
  sourceUrl?: string | null;
}): Promise<ReformatResult> {
  const cleaned = stripScrapeNoise(opts.content);
  const style = pickStyle(opts.style ?? "auto", cleaned);

  const category = await classifyKbCategory(opts.title, cleaned);
  const examples = await fetchStyleExamples(category);

  const apiKey = process.env["OPENROUTER_API_KEY"];

  // Tanpa AI: kembalikan versi yang sudah dibersihkan, tandai ai_used=false
  // supaya UI jujur bahwa ini BUKAN hasil AI.
  if (!apiKey) {
    return {
      title: opts.title,
      content: cleaned,
      summary: "",
      keywords: "",
      important_notes: "",
      category,
      style_used: style,
      style_examples: [],
      ai_used: false,
    };
  }

  const styleBlock = examples.length
    ? `CONTOH ARTIKEL ASLI DARI KNOWLEDGE BASE AINA (kategori ${category}).
Tirukan GAYA, PANJANG, dan STRUKTUR seperti ini — jangan tiru isinya:

${examples
  .map(
    (e, i) => `--- CONTOH ${i + 1} ---
Judul: ${e.title}
Ringkasan: ${e.summary}
Kata kunci: ${e.keywords}
Isi:
${e.content.slice(0, 1500)}`,
  )
  .join("\n\n")}
--- AKHIR CONTOH ---`
    : "(Belum ada artikel contoh di kategori ini — pakai penilaianmu sendiri.)";

  const prompt = `Kamu adalah editor knowledge base AINA, asisten AI untuk Masisir
(Mahasiswa Indonesia di Mesir). Tugasmu: merapikan hasil scraping mentah menjadi
artikel yang siap dibaca AINA.

${styleBlock}

FORMAT YANG DIMINTA:
${STYLE_INSTRUCTIONS[style]}

ATURAN WAJIB:
1. BUANG semua sampah scraping: navigasi situs, "Categories Home", nama penulis,
   tanggal publikasi, "Share:", jumlah views, "Baca juga", footer.
2. JANGAN mengarang. Hanya gunakan informasi yang ADA di teks sumber.
   Kalau suatu detail tidak ada, jangan diisi.
3. Tulis dalam Bahasa Indonesia yang jelas dan langsung ke inti.
4. Pertahankan SEMUA angka konkret: biaya, tanggal, alamat, nomor telepon,
   nama kantor, syarat dokumen. Ini yang paling dicari mahasiswa.
5. Judul harus deskriptif dan spesifik, bukan clickbait.
6. Konten dalam format Markdown.

TEKS SUMBER:
Judul asli: ${opts.title}
${opts.sourceUrl ? `Sumber: ${opts.sourceUrl}` : ""}

${cleaned.slice(0, 12000)}

Balas HANYA dengan JSON valid, tanpa markdown fence, tanpa penjelasan:
{
  "title": "judul deskriptif",
  "content": "isi artikel dalam Markdown",
  "summary": "1-2 kalimat inti artikel",
  "keywords": "kata,kunci,dipisah,koma",
  "important_notes": "peringatan/catatan penting, atau string kosong kalau tidak ada"
}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenRouter HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const raw = (data.choices?.[0]?.message?.content ?? "").trim();
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

    const parsed = JSON.parse(jsonText) as Partial<ReformatResult>;

    // Jangan percaya output AI mentah-mentah — validasi dulu.
    if (!parsed.content || parsed.content.trim().length < 50) {
      throw new Error("AI mengembalikan konten kosong / terlalu pendek");
    }

    return {
      title: (parsed.title ?? opts.title).trim().slice(0, 200),
      content: parsed.content.trim(),
      summary: (parsed.summary ?? "").trim().slice(0, 500),
      keywords: (parsed.keywords ?? "").trim().slice(0, 300),
      important_notes: (parsed.important_notes ?? "").trim().slice(0, 1000),
      category,
      style_used: style,
      style_examples: examples.map((e) => e.title),
      ai_used: true,
    };
  } catch (err) {
    logger.error(
      { err: (err as Error).message, model: OPENROUTER_MODEL, style },
      "[reformat] AI gagal - mengembalikan versi yang hanya dibersihkan",
    );

    return {
      title: opts.title,
      content: cleaned,
      summary: "",
      keywords: "",
      important_notes: "",
      category,
      style_used: style,
      style_examples: [],
      ai_used: false,
    };
  }
}
