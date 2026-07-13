import { Router, type IRouter } from "express";
import pdfParse from "pdf-parse";
import { db, scraperDraftsTable } from "@workspace/db";
import { ScrapeUrlBody, ScrapeManualBody, ScrapePdfBody, ScrapeInstagramBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { analyzeWithOpenRouter, fetchAndExtractUrl, scrapeInstagramPost, ocrImageWithOpenRouter, IG_MAX_OCR_SLIDES } from "../lib/scrapeUtils";
import { findDuplicates } from "../lib/dedupe";

const router: IRouter = Router();

function toDraftResponse(d: typeof scraperDraftsTable.$inferSelect) {
  return {
    id: d.id,
    title: d.title,
    content: d.content,
    summary: d.summary,
    tags: d.tags,
    category: d.category,
    source_url: d.sourceUrl,
    source_type: d.sourceType,
    relevance_score: d.relevanceScore,
    status: d.status,
    submitted_by: d.submittedBy,
    rejection_reason: d.rejectionReason,
    created_at: d.createdAt.toISOString(),
  };
}

// Scrape from URL — fetch konten asli dari URL
router.post("/scrape/url", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const parsed = ScrapeUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rawUrl = parsed.data.url.startsWith("http") ? parsed.data.url : `https://${parsed.data.url}`;

  let pageTitle = `Artikel dari ${new URL(rawUrl).hostname}`;
  let extractedText = "";

  try {
    const { title, text } = await fetchAndExtractUrl(rawUrl);
    pageTitle = title;
    extractedText = text;
  } catch (err) {
    const msg = (err as Error).message ?? "unknown error";
    const isTimeout = msg.includes("abort") || msg.includes("timeout");
    res.status(422).json({
      error: isTimeout
        ? "Gagal mengambil URL: koneksi timeout (lebih dari 10 detik)"
        : `Gagal mengambil URL: ${msg}`,
    });
    return;
  }

  const { summary, tags, relevanceScore, aiUsed, aiError } = await analyzeWithOpenRouter(extractedText, pageTitle);
  const status = relevanceScore <= 50 ? "rejected" : "draft";

  const [draft] = await db.insert(scraperDraftsTable).values({
    title: pageTitle,
    content: extractedText || `Konten dari ${rawUrl}`,
    summary,
    tags,
    sourceUrl: parsed.data.url,
    sourceType: "url",
    relevanceScore,
    status,
    submittedBy: user.username,
  }).returning();

  // ai_used=false berarti skor & ringkasan berasal dari heuristik kata kunci,
  // BUKAN AI. UI menampilkan peringatan agar user tidak salah percaya.
  // Cek duplikat: beri tahu kontributor kalau informasi ini SUDAH ADA,
  // supaya mereka mencari topik lain daripada membuang waktu.
  const dup = await findDuplicates({
    title: draft.title,
    content: draft.content,
    sourceUrl: draft.sourceUrl,
    excludeDraftId: draft.id,
  });

  res.json({
    ...toDraftResponse(draft),
    ai_used: aiUsed,
    ai_error: aiError ?? null,
    duplicate: dup,
  });
});

// Process manual text
router.post("/scrape/manual", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const parsed = ScrapeManualBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const title = parsed.data.title || "Draft Manual " + new Date().toLocaleDateString("id-ID");
  const { summary, tags, relevanceScore, aiUsed, aiError } = await analyzeWithOpenRouter(parsed.data.text, title);
  const status = relevanceScore <= 50 ? "rejected" : "draft";

  const [draft] = await db.insert(scraperDraftsTable).values({
    title,
    content: parsed.data.text,
    summary,
    tags,
    sourceType: "manual",
    relevanceScore,
    status,
    submittedBy: user.username,
  }).returning();

  // ai_used=false berarti skor & ringkasan berasal dari heuristik kata kunci,
  // BUKAN AI. UI menampilkan peringatan agar user tidak salah percaya.
  // Cek duplikat: beri tahu kontributor kalau informasi ini SUDAH ADA,
  // supaya mereka mencari topik lain daripada membuang waktu.
  const dup = await findDuplicates({
    title: draft.title,
    content: draft.content,
    sourceUrl: draft.sourceUrl,
    excludeDraftId: draft.id,
  });

  res.json({
    ...toDraftResponse(draft),
    ai_used: aiUsed,
    ai_error: aiError ?? null,
    duplicate: dup,
  });
});

// Process PDF
router.post("/scrape/pdf", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const parsed = ScrapePdfBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const pdfTitle = parsed.data.filename.replace(/\.pdf$/i, "");

  let extractedText = "";
  try {
    const buffer = Buffer.from(parsed.data.content_base64, "base64");
    const pdfData = await pdfParse(buffer);
    extractedText = pdfData.text?.trim() ?? "";
  } catch {
    res.status(422).json({ error: "Gagal mengekstrak teks dari PDF. Pastikan file tidak terenkripsi." });
    return;
  }

  if (!extractedText) {
    res.status(422).json({ error: "Gagal mengekstrak teks dari PDF. Pastikan file tidak terenkripsi." });
    return;
  }

  const content = extractedText.substring(0, 8000);
  const { summary, tags, relevanceScore, aiUsed, aiError } = await analyzeWithOpenRouter(content, pdfTitle);
  const status = relevanceScore <= 50 ? "rejected" : "draft";

  const [draft] = await db.insert(scraperDraftsTable).values({
    title: pdfTitle,
    content,
    summary,
    tags,
    sourceType: "pdf",
    relevanceScore,
    status,
    submittedBy: user.username,
  }).returning();

  // ai_used=false berarti skor & ringkasan berasal dari heuristik kata kunci,
  // BUKAN AI. UI menampilkan peringatan agar user tidak salah percaya.
  // Cek duplikat: beri tahu kontributor kalau informasi ini SUDAH ADA,
  // supaya mereka mencari topik lain daripada membuang waktu.
  const dup = await findDuplicates({
    title: draft.title,
    content: draft.content,
    sourceUrl: draft.sourceUrl,
    excludeDraftId: draft.id,
  });

  res.json({
    ...toDraftResponse(draft),
    ai_used: aiUsed,
    ai_error: aiError ?? null,
    duplicate: dup,
  });
});

// Scrape Instagram — Apify + OCR Vision
router.post("/scrape/instagram", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const parsed = ScrapeInstagramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Link Instagram wajib diisi." });
    return;
  }

  let caption = "";
  let imageUrls: string[] = [];
  let username = "";
  let postUrl = parsed.data.url;

  try {
    ({ caption, imageUrls, username, postUrl } = await scrapeInstagramPost(parsed.data.url));
  } catch (err) {
    const msg = (err as Error).message ?? "Gagal mengambil post Instagram";

    if (msg.includes("APIFY_API_TOKEN tidak dikonfigurasi")) {
      res.status(503).json({
        error: "Fitur Instagram belum dikonfigurasi. Minta admin menambahkan APIFY_API_TOKEN.",
      });
      return;
    }

    // Pesan dari normalizeInstagramUrl() sudah ramah-pengguna -> teruskan apa adanya.
    res.status(422).json({ error: msg });
    return;
  }

  // ---------------------------------------------------------------------
  // OCR SELURUH SLIDE, bukan cuma yang pertama.
  //
  // BUG LAMA: hanya imageUrls[0] yang di-OCR. Postingan Masisir hampir selalu
  // infografis CAROUSEL 5-10 slide — jadi 80% isinya hilang dan draft-nya
  // nyaris kosong. Ini juga yang membuat skor relevansi sering rendah.
  // ---------------------------------------------------------------------
  const slides = imageUrls.slice(0, IG_MAX_OCR_SLIDES);

  const ocrResults = await Promise.all(
    slides.map(async (imgUrl, i) => {
      try {
        const text = await ocrImageWithOpenRouter(imgUrl);
        return text ? `[Slide ${i + 1}]\n${text}` : "";
      } catch {
        return "";
      }
    }),
  );

  const ocrText = ocrResults.filter(Boolean).join("\n\n");

  const content = [
    caption,
    ocrText ? `[Teks dalam gambar]\n${ocrText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!content.trim()) {
    res.status(422).json({
      error:
        "Tidak ada teks yang bisa diambil dari postingan ini. " +
        "Postingan mungkin hanya berisi video/foto tanpa caption dan tanpa teks di gambar.",
    });
    return;
  }

  // Judul dari baris pertama caption — jauh lebih berguna daripada
  // "IG @user - 13/07/2026" yang dulu dipakai dan membuat semua draft IG
  // terlihat sama di daftar.
  const firstLine = caption
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 10);

  const igTitle = firstLine
    ? `${firstLine.slice(0, 120)}${firstLine.length > 120 ? "…" : ""}`
    : `Postingan IG @${username || "instagram"}`;
  const { summary, tags, relevanceScore, aiUsed, aiError } = await analyzeWithOpenRouter(content, igTitle);
  const status = relevanceScore <= 50 ? "rejected" : "draft";

  const [draft] = await db.insert(scraperDraftsTable).values({
    title: igTitle,
    content,
    summary,
    tags,
    sourceUrl: postUrl, // sudah dinormalisasi: tanpa ?igsh=, ?utm_, dll
    sourceType: "instagram",
    relevanceScore,
    status,
    submittedBy: user.username,
  }).returning();

  // ai_used=false berarti skor & ringkasan berasal dari heuristik kata kunci,
  // BUKAN AI. UI menampilkan peringatan agar user tidak salah percaya.
  // Cek duplikat: beri tahu kontributor kalau informasi ini SUDAH ADA,
  // supaya mereka mencari topik lain daripada membuang waktu.
  const dup = await findDuplicates({
    title: draft.title,
    content: draft.content,
    sourceUrl: draft.sourceUrl,
    excludeDraftId: draft.id,
  });

  res.json({
    ...toDraftResponse(draft),
    ai_used: aiUsed,
    ai_error: aiError ?? null,
    duplicate: dup,
  });
});

export default router;
