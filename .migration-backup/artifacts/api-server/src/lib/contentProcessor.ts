/**
 * contentProcessor.ts — pipeline artikel menuju knowledge_base AINA.
 *
 * DITULIS ULANG. Versi lama menulis ke kolom yang TIDAK ADA di tabel produksi
 * (`source`, `chunk_index`) dan menyimpan embedding sebagai JSON string,
 * padahal kolomnya bertipe vector(1536). Akibatnya setiap approve gagal.
 *
 * Perubahan penting:
 *   1. CHUNKING DIHAPUS untuk knowledge_base.
 *      Tabel AINA = SATU BARIS PER ARTIKEL (312 artikel, embedding per artikel).
 *      Chunking lama membuat baris duplikat berjudul "Judul (2)", "Judul (3)"...
 *      yang akan mengotori knowledge base produksi.
 *
 *   2. Embedding memakai voyage-3-lite (Voyage AI), 512 dimensi — SAMA PERSIS
 *      dengan 313 artikel yang sudah ada (dicek dari kolom embedding_model).
 *      Model/dimensi berbeda = insert ditolak Postgres DAN pencarian AINA kacau.
 *
 *   3. Embedding digenerate oleh scraper, bukan menunggu AINA.
 *      Kalau AINA punya proses backfill, dia akan melewati artikel ini
 *      (embedding sudah terisi). Kalau tidak punya, artikel tetap bisa dicari.
 *      Aman di kedua skenario.
 */

import { eq } from "drizzle-orm";
import { db, knowledgeBaseTable, KB_EMBEDDING_DIMENSIONS } from "@workspace/db";
import { logger } from "./logger";

// ─── 1. cleanText ────────────────────────────────────────────────────────────

export function cleanText(text: string): string {
  let result = text.replace(/<[^>]+>/g, "");
  result = result.replace(
    /[^\w\s\n.,!?;:()\-'""/\u00C0-\u024F\u0600-\u06FF]/g,
    " ",
  );
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/[ \t]+/g, " ");
  result = result
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  return result.trim();
}

// ─── 2. toMarkdown ───────────────────────────────────────────────────────────

export function toMarkdown(title: string, content: string): string {
  const body = content
    .split(/\n+/)
    .filter((l) => l.trim().length > 0)
    .map((l) => l.trim())
    .join("\n\n");

  return `# ${title}\n\n${body}`;
}

// ─── 3. generateEmbedding ────────────────────────────────────────────────────

/**
 * Model embedding PRODUKSI: voyage-3-lite (Voyage AI), 512 dimensi.
 *
 * JANGAN GANTI tanpa re-embed 313 artikel lama.
 *
 * Versi lama memakai OpenAI text-embedding-3-large (3072 dim, dipotong ke 1536).
 * Itu SALAH TOTAL: bukan cuma beda dimensi, tapi beda RUANG VEKTOR.
 * Membandingkan vektor OpenAI dengan vektor Voyage menghasilkan angka
 * similarity yang tidak berarti apa-apa — bukan sekadar kurang akurat,
 * tapi acak. Dan karena kolomnya vector(512), Postgres menolak vektor 1536:
 *
 *     ERROR: different vector dimensions 512 and 1536
 *
 * Itulah sumber HTTP 500 di /scrape/url & /scrape/instagram, dan juga sumber
 * artikel ber-embedding NULL setelah approve (error-nya ditelan oleh
 * .catch() fire-and-forget di routes/drafts.ts).
 */
export const EMBEDDING_MODEL = "voyage-3-lite";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

/**
 * input_type Voyage: "document" | "query" | null.
 *
 * WAJIB SAMA dengan yang dipakai AINA saat meng-embed 313 artikel lama.
 * Kalau beda, vektornya tetap 512 dimensi dan query tetap jalan, tapi
 * similarity-nya bergeser — dedupe jadi meleset tanpa ada error apa pun.
 *
 * Default: tidak dikirim (null), yaitu perilaku pemanggilan paling polos.
 * Kalau di repo AINA ternyata dipakai "document", set env VOYAGE_INPUT_TYPE=document.
 */
const VOYAGE_INPUT_TYPE = process.env["VOYAGE_INPUT_TYPE"];

/**
 * Generate embedding 512-dimensi untuk knowledge_base AINA.
 *
 * Mengembalikan number[] (BUKAN JSON string) — drizzle mengirimnya langsung ke
 * kolom vector(512).
 *
 * Return null kalau tidak ada API key atau request gagal. Artikel tetap
 * tersimpan; dedupe otomatis turun ke lapis URL + judul (lihat dedupe.ts).
 *
 * TIDAK ADA FALLBACK KE OPENAI. Fallback yang menghasilkan vektor dari ruang
 * berbeda lebih berbahaya daripada tidak ada embedding sama sekali: yang satu
 * gagal dengan jujur, yang satu lagi berbohong dengan angka yang meyakinkan.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const key = process.env["VOYAGE_API_KEY"];

  if (!key) {
    logger.warn(
      "[generateEmbedding] VOYAGE_API_KEY tidak diset — artikel disimpan tanpa " +
        "embedding dan TIDAK akan muncul di pencarian AINA. Dedupe semantik nonaktif.",
    );
    return null;
  }

  const input = text.trim().slice(0, 30_000);
  if (!input) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(VOYAGE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [input],
        ...(VOYAGE_INPUT_TYPE ? { input_type: VOYAGE_INPUT_TYPE } : {}),
        truncation: true,
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error(
        { status: response.status, body: body.slice(0, 300) },
        "[generateEmbedding] Request Voyage gagal",
      );
      return null;
    }

    const data = (await response.json()) as {
      data?: { embedding?: number[] }[];
    };

    const raw = data.data?.[0]?.embedding;

    if (!Array.isArray(raw) || raw.length === 0) {
      logger.error("[generateEmbedding] Response Voyage tidak berisi embedding");
      return null;
    }

    // Dimensi HARUS persis. Menyimpan dimensi lain = insert ditolak Postgres,
    // dan kalaupun lolos, pencarian AINA jadi kacau. Lebih baik null.
    if (raw.length !== KB_EMBEDDING_DIMENSIONS) {
      logger.error(
        { got: raw.length, expected: KB_EMBEDDING_DIMENSIONS, model: EMBEDDING_MODEL },
        "[generateEmbedding] Dimensi tidak cocok dengan kolom knowledge_base. Dibatalkan.",
      );
      return null;
    }

    return raw;
  } catch (err) {
    logger.error(
      { reason: (err as Error).message?.slice(0, 300) },
      "[generateEmbedding] Request Voyage gagal",
    );
    return null;
  }
}

// ─── 4. processAndStoreArticle ───────────────────────────────────────────────

/**
 * Lengkapi baris knowledge_base yang baru dibuat dengan embedding-nya.
 *
 * Dipanggil fire-and-forget dari route approve, jadi respons approve tidak
 * menunggu Voyage. CATATAN: karena fire-and-forget, kegagalan di sini TIDAK
 * membuat approve gagal — artikel tetap masuk KB, hanya tanpa embedding.
 * Cek berkala: SELECT count(*) FROM knowledge_base WHERE embedding IS NULL; Server ini long-lived (Railway), sehingga proses background
 * benar-benar selesai — di serverless, proses akan dibunuh setelah respons.
 */
export async function processAndStoreArticle(
  knowledgeBaseId: string,
  title: string,
  content: string,
): Promise<{ embedded: boolean }> {
  logger.info({ knowledgeBaseId, title }, "[processAndStoreArticle] Mulai");

  const markdown = toMarkdown(title, cleanText(content));

  // Embed judul + isi: judul membawa sinyal semantik yang kuat untuk pencarian.
  const embedding = await generateEmbedding(`${title}\n\n${markdown}`);

  await db
    .update(knowledgeBaseTable)
    .set({
      content: markdown,
      embedding,
      embeddingModel: embedding ? EMBEDDING_MODEL : null,
      updatedAt: new Date(),
      lastUpdated: new Date(),
    })
    .where(eq(knowledgeBaseTable.id, knowledgeBaseId));

  logger.info(
    { knowledgeBaseId, embedded: embedding !== null },
    "[processAndStoreArticle] Selesai",
  );

  return { embedded: embedding !== null };
}
