/**
 * Shared utilities: AI analysis + URL content extraction + Instagram scraping.
 * Digunakan oleh routes/scrape.ts dan routes/cron.ts.
 */
import { load } from "cheerio";
import { ApifyClient } from "apify-client";

// ---------------------------------------------------------------------------
import { logger } from "./logger";

/**
 * Model OpenRouter untuk analisis & klasifikasi.
 *
 * BUG YANG DIPERBAIKI: kode lama memakai "google/gemini-flash-1.5" — model itu
 * SUDAH TIDAK ADA di OpenRouter. Setiap panggilan gagal, lalu kode diam-diam
 * jatuh ke heuristik kata kunci. Akibatnya "skor relevansi AI" dan "ringkasan
 * AI" yang muncul di aplikasi sebenarnya BUKAN hasil AI sama sekali — dan tidak
 * ada satu pun tanda di UI yang memberitahu.
 *
 * Sekarang: model bisa diatur lewat env, defaultnya model yang masih hidup.
 */
export const OPENROUTER_MODEL = process.env["OPENROUTER_MODEL"] ?? "google/gemini-2.5-flash";

/** Diisi true kalau panggilan AI terakhir BENAR-BENAR berhasil (bukan fallback). */
export interface AnalysisResult {
  summary: string;
  tags: string;
  relevanceScore: number;
  /** false = hasil dari heuristik kata kunci, bukan AI. Ditampilkan di UI. */
  aiUsed: boolean;
  /** Alasan kalau AI gagal — muncul di log & bisa ditampilkan ke admin. */
  aiError?: string;
}

// Heuristic fallback (dipakai jika OpenRouter tidak tersedia / gagal)
// ---------------------------------------------------------------------------
export function simulateAiAnalysis(text: string, _title?: string) {
  const wordCount = text.split(/\s+/).length;
  const masisirKeywords = [
    "mahasiswa", "indonesia", "mesir", "kairo", "masisir",
    "beasiswa", "kuliah", "universitas", "cairo", "al-azhar", "imbasindo", "kkm",
  ];
  const lowerText = text.toLowerCase();
  const keywordMatches = masisirKeywords.filter(k => lowerText.includes(k)).length;
  const rawScore = Math.min(100, 40 + keywordMatches * 10 + Math.min(20, wordCount / 10));
  const relevanceScore = Math.round(rawScore);

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20).slice(0, 3);
  const summary = sentences.join(". ").substring(0, 500) || text.substring(0, 300);
  const tags = masisirKeywords.filter(k => lowerText.includes(k)).slice(0, 5).join(", ") || "umum";

  // aiUsed:false -> UI menampilkan peringatan bahwa ini BUKAN hasil AI.
  return { summary, tags, relevanceScore, aiUsed: false };
}

// ---------------------------------------------------------------------------
// Analisis teks dengan OpenRouter (fallback ke heuristic jika gagal)
// ---------------------------------------------------------------------------
export async function analyzeWithOpenRouter(
  text: string,
  title?: string,
): Promise<AnalysisResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    logger.warn("[analyzeWithOpenRouter] OPENROUTER_API_KEY kosong - memakai heuristik, BUKAN AI");
    return { ...simulateAiAnalysis(text, title), aiError: "OPENROUTER_API_KEY belum di-set" };
  }

  try {
    const truncatedText = text.substring(0, 4000);
    const userPrompt = title
      ? `Judul: ${title}\n\nIsi artikel:\n${truncatedText}`
      : `Isi artikel:\n${truncatedText}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Kamu adalah AI analis konten untuk AINA, asisten mahasiswa Indonesia di Mesir (Masisir). " +
              "Tugasmu menganalisis artikel dan menentukan relevansinya.",
          },
          {
            role: "user",
            content:
              `${userPrompt}\n\n` +
              `Analisis artikel di atas dan balas HANYA dengan JSON (tanpa markdown, tanpa kode blok) dengan format PERSIS:\n` +
              `{"summary": "ringkasan 2-3 kalimat", "tags": "tag1, tag2, tag3", "relevance_score": 75}\n\n` +
              `relevance_score adalah angka 0-100 yang menunjukkan seberapa relevan konten ini dengan konteks Masisir ` +
              `(mahasiswa Indonesia di Mesir, Al-Azhar, beasiswa, kehidupan di Kairo, dll).`,
          },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // 404 = slug model salah/mati. Ini yang dulu terjadi diam-diam.
      throw new Error(
        `OpenRouter HTTP ${response.status} (model: ${OPENROUTER_MODEL}) ${body.slice(0, 200)}`,
      );
    }

    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { summary?: string; tags?: string; relevance_score?: number };

    return {
      summary: parsed.summary ?? "",
      tags: parsed.tags ?? "",
      relevanceScore: Math.round(Number(parsed.relevance_score) || 0),
      aiUsed: true,
    };
  } catch (err) {
    const msg = (err as Error).message;

    // Dulu ini cuma console.warn dan hasilnya dikembalikan seolah-olah dari AI.
    // Sekarang: dicatat sebagai ERROR, dan hasilnya ditandai aiUsed:false agar
    // UI bisa memberi tahu user bahwa skor ini BUKAN dari AI.
    logger.error(
      { model: OPENROUTER_MODEL, err: msg },
      "[analyzeWithOpenRouter] AI GAGAL - memakai heuristik kata kunci sebagai gantinya",
    );

    return { ...simulateAiAnalysis(text, title), aiError: msg };
  }
}

// ---------------------------------------------------------------------------
// Fetch URL dan ekstrak konten teks + judul halaman
// Melempar Error jika fetch gagal (caller bertanggung jawab menangani)
// ---------------------------------------------------------------------------
export async function fetchAndExtractUrl(
  rawUrl: string,
): Promise<{ title: string; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let fetchRes: Response;
  try {
    fetchRes = await fetch(rawUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AINA-Scraper/2.0)" },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!fetchRes.ok) {
    throw new Error(`HTTP ${fetchRes.status}`);
  }

  const html = await fetchRes.text();
  const $ = load(html);

  const title = $("title").first().text().trim() || `Artikel dari ${new URL(rawUrl).hostname}`;

  const parts: string[] = [];
  $("h1, h2, h3, h4, h5, h6, p, article").each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 0) parts.push(t);
  });
  let text = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!text) text = $("body").text().replace(/\s+/g, " ").trim().substring(0, 5000);

  return { title, text };
}

// ---------------------------------------------------------------------------
// Scrape konten Instagram post via Apify
// Melempar Error jika APIFY_API_TOKEN tidak ada atau post tidak ditemukan
// ---------------------------------------------------------------------------
/**
 * Actor Apify untuk Instagram.
 *
 * BUG YANG DIPERBAIKI: kode lama memakai "apify/instagram-post-scraper" dan
 * mengirim `directUrls`. Actor itu bersifat USERNAME-IN — inputnya field
 * `username`, bukan link postingan. Apify menolak input kita dan mengembalikan
 * error "username is required", yang muncul di UI sebagai HTTP 422.
 *
 * "apify/instagram-scraper" adalah satu-satunya actor resmi yang menerima
 * URL POSTINGAN LANGSUNG lewat `directUrls`. Itulah yang kita butuhkan:
 * kontributor cukup tempel link postingan, tanpa perlu tahu username.
 */
export const APIFY_IG_ACTOR =
  process.env["APIFY_INSTAGRAM_ACTOR"] ?? "apify/instagram-scraper";

/** Berapa slide carousel yang di-OCR. Postingan Masisir sering infografis banyak slide. */
export const IG_MAX_OCR_SLIDES = Number(process.env["IG_MAX_OCR_SLIDES"] ?? 5);

/**
 * Bersihkan & validasi URL postingan Instagram.
 *
 * Menerima semua bentuk yang biasa di-copy orang dari aplikasi:
 *   https://www.instagram.com/p/ABC123/?igsh=xxxx&img_index=1
 *   https://instagram.com/reel/ABC123
 *   https://www.instagram.com/tv/ABC123/
 *   instagram.com/p/ABC123
 *
 * Parameter pelacakan (?igsh=, ?utm_) DIBUANG — kalau ikut terkirim, Apify
 * kadang gagal mencocokkan postingan.
 */
export function normalizeInstagramUrl(raw: string): string {
  let input = raw.trim();
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;

  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new Error("Link Instagram tidak valid. Contoh: https://www.instagram.com/p/ABC123/");
  }

  if (!/(^|\.)instagram\.com$/i.test(u.hostname)) {
    throw new Error("Link harus dari instagram.com. Untuk artikel web biasa, gunakan tab URL.");
  }

  // /p/<kode>, /reel/<kode>, /reels/<kode>, /tv/<kode>
  const m = /\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(u.pathname);
  if (!m) {
    throw new Error(
      "Ini bukan link POSTINGAN. Yang dibutuhkan link satu postingan " +
        "(mengandung /p/, /reel/, atau /tv/), bukan link profil atau story.",
    );
  }

  const kind = m[1] === "reels" ? "reel" : m[1];
  return `https://www.instagram.com/${kind}/${m[2]}/`;
}

/** Kumpulkan URL gambar dari sebuah post, termasuk seluruh slide carousel. */
function collectImageUrls(post: Record<string, unknown>): string[] {
  const urls: string[] = [];

  const push = (v: unknown) => {
    if (typeof v === "string" && v.startsWith("http") && !urls.includes(v)) urls.push(v);
  };

  // Carousel: tiap slide ada di childPosts / sidecarChildren.
  for (const key of ["childPosts", "sidecarChildren"]) {
    const children = post[key];
    if (Array.isArray(children)) {
      for (const c of children as Record<string, unknown>[]) {
        push(c?.["displayUrl"]);
        if (Array.isArray(c?.["images"])) for (const i of c["images"] as unknown[]) push(i);
      }
    }
  }

  // Post tunggal.
  if (Array.isArray(post["images"])) {
    for (const img of post["images"] as unknown[]) {
      if (typeof img === "string") push(img);
      else push((img as Record<string, unknown>)?.["url"]);
    }
  }
  push(post["displayUrl"]);

  return urls;
}

export async function scrapeInstagramPost(
  rawUrl: string,
): Promise<{ caption: string; imageUrls: string[]; username: string; postUrl: string }> {
  const token = process.env["APIFY_API_TOKEN"];
  if (!token) throw new Error("APIFY_API_TOKEN tidak dikonfigurasi");

  const url = normalizeInstagramUrl(rawUrl);
  const client = new ApifyClient({ token });

  let run;
  try {
    run = await client.actor(APIFY_IG_ACTOR).call(
      {
        // Inilah kuncinya: actor ini menerima URL postingan langsung,
        // jadi kontributor TIDAK perlu memasukkan username.
        directUrls: [url],
        resultsType: "posts",
        resultsLimit: 1,
        addParentData: false,
        searchLimit: 1,
      },
      { waitSecs: 120 },
    );
  } catch (err) {
    const msg = (err as Error).message ?? "";
    logger.error({ actor: APIFY_IG_ACTOR, url, err: msg }, "[instagram] Panggilan Apify gagal");

    if (/username/i.test(msg)) {
      throw new Error(
        `Actor Apify "${APIFY_IG_ACTOR}" meminta username, bukan link postingan. ` +
          `Set env APIFY_INSTAGRAM_ACTOR=apify/instagram-scraper`,
      );
    }
    if (/credit|payment|quota|limit/i.test(msg)) {
      throw new Error("Kuota Apify habis. Cek saldo akun Apify kamu.");
    }
    throw new Error(`Gagal menghubungi Apify: ${msg.slice(0, 200)}`);
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  if (!items || items.length === 0) {
    throw new Error(
      "Postingan tidak ditemukan. Kemungkinan akunnya privat, postingan sudah dihapus, " +
        "atau linknya salah.",
    );
  }

  const post = items[0] as Record<string, unknown>;

  // Actor kadang mengembalikan objek error alih-alih post.
  if (typeof post["error"] === "string") {
    throw new Error(`Instagram menolak: ${post["error"]}`);
  }

  const caption = typeof post["caption"] === "string" ? post["caption"] : "";
  const username =
    (typeof post["ownerUsername"] === "string" && post["ownerUsername"]) ||
    (typeof post["ownerFullName"] === "string" && post["ownerFullName"]) ||
    "";

  const imageUrls = collectImageUrls(post);

  logger.info(
    { url, username, slides: imageUrls.length, captionLen: caption.length },
    "[instagram] Postingan berhasil diambil",
  );

  return { caption, imageUrls, username, postUrl: url };
}


// ---------------------------------------------------------------------------
// OCR gambar menggunakan OpenRouter Vision (Gemini Flash)
// Return "" tanpa throw jika gagal (non-critical)
// ---------------------------------------------------------------------------
export async function ocrImageWithOpenRouter(imageUrl: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "";

  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return "";

    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const base64 = buffer.toString("base64");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${contentType};base64,${base64}` },
              },
              {
                type: "text",
                text: "Ekstrak semua teks yang terlihat dalam gambar ini secara verbatim. Jika tidak ada teks, balas dengan: Tidak ada teks dalam gambar.",
              },
            ],
          },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) return "";

    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Klasifikasi kategori knowledge_base
//
// Kolom `category` di knowledge_base bersifat NOT NULL tanpa default, dan
// aplikasi AINA hanya mengenal 6 nilai (lihat KB_CATEGORIES). Draft scraper
// punya kategori bebas ("Pendidikan", "Beasiswa", ...) yang TIDAK cocok, jadi
// harus dipetakan sebelum insert — kalau tidak, approve gagal / data kotor.
// ---------------------------------------------------------------------------
import { KB_CATEGORIES, KB_DEFAULT_CATEGORY, type KbCategory } from "@workspace/db";

/** Pemetaan heuristik berbasis kata kunci — dipakai kalau AI tidak tersedia/gagal. */
function classifyCategoryHeuristic(text: string): KbCategory {
  const t = text.toLowerCase();

  const rules: [KbCategory, string[]][] = [
    ["Administrasi", ["visa", "iqamah", "paspor", "imigrasi", "legalisir", "kbri", "izin tinggal", "dokumen", "administrasi"]],
    ["Tempat Tinggal", ["asrama", "sakan", "kontrakan", "sewa", "rumah", "apartemen", "tempat tinggal", "kos"]],
    ["Transport", ["transportasi", "metro", "bus", "kereta", "taksi", "uber", "careem", "tremco", "angkutan"]],
    ["Bahasa", ["bahasa arab", "nahwu", "shorof", "kosakata", "amiyah", "fusha", "belajar bahasa"]],
    ["Akademik", ["kuliah", "universitas", "al-azhar", "azhar", "beasiswa", "ujian", "fakultas", "akademik", "talaqqi", "syahadah", "pendaftaran"]],
    ["Kehidupan Mesir", ["kairo", "mesir", "harga", "makanan", "budaya", "kehidupan", "sehari-hari", "masisir"]],
  ];

  for (const [category, keywords] of rules) {
    if (keywords.some((k) => t.includes(k))) return category;
  }

  return KB_DEFAULT_CATEGORY;
}

/**
 * Klasifikasikan artikel ke salah satu dari 6 kategori knowledge_base AINA.
 * Selalu mengembalikan kategori valid — tidak pernah null.
 */
export async function classifyKbCategory(
  title: string,
  content: string,
): Promise<KbCategory> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const fallbackInput = `${title} ${content}`;

  if (!apiKey) return classifyCategoryHeuristic(fallbackInput);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "user",
            content:
              `Judul: ${title}\n\nIsi:\n${content.slice(0, 2000)}\n\n` +
              `Klasifikasikan artikel di atas ke TEPAT SATU kategori berikut:\n` +
              `${KB_CATEGORIES.join(", ")}\n\n` +
              `Balas HANYA dengan nama kategorinya persis, tanpa tanda kutip, ` +
              `tanpa penjelasan, tanpa tanda baca tambahan.`,
          },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) return classifyCategoryHeuristic(fallbackInput);

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const raw = (data.choices?.[0]?.message?.content ?? "").trim();

    // Jangan percaya output AI — validasi terhadap daftar yang diizinkan.
    const match = KB_CATEGORIES.find(
      (c) => c.toLowerCase() === raw.toLowerCase(),
    );

    return match ?? classifyCategoryHeuristic(fallbackInput);
  } catch {
    return classifyCategoryHeuristic(fallbackInput);
  }
}
