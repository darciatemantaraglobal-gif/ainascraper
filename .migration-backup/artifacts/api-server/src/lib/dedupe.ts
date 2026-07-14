/**
 * Deteksi duplikat knowledge base — TIGA LAPIS.
 *
 * ATURAN NOMOR SATU: FUNGSI INI TIDAK BOLEH THROW.
 * Dedupe adalah fitur PELENGKAP. Kalau dia mati, scrape HARUS tetap jalan.
 * Versi lama menaruh dedupe di jalur utama tanpa proteksi, jadi satu error
 * pgvector = seluruh /scrape/url dan /scrape/instagram balas 500, padahal
 * draft-nya sudah aman tersimpan di DB.
 *
 * Setiap lapis dibungkus try/catch SENDIRI-SENDIRI. Lapis yang mati dilewati,
 * lapis lain tetap jalan. Kalau semua mati, kita balikin laporan `degraded`
 * (BUKAN "aman") supaya UI tidak berbohong ke kontributor.
 *
 *   1. URL SAMA PERSIS (paling murah, paling pasti)
 *   2. JUDUL SANGAT MIRIP (murah, tanpa API call) — jaring pengaman
 *   3. MAKNA SANGAT MIRIP (embedding + pgvector) — lapis terkuat
 */
import { sql, and, ne, isNotNull } from "drizzle-orm";
import { db, knowledgeBaseTable, scraperDraftsTable, KB_EMBEDDING_DIMENSIONS } from "@workspace/db";
import { generateEmbedding } from "./contentProcessor";
import { logger } from "./logger";

/** Di atas ini = hampir pasti duplikat. Blokir/keraskan peringatan. */
export const SIM_STRONG = Number(process.env["DEDUPE_STRONG"] ?? 0.92);
/** Di atas ini = mirip, perlu dilihat manusia. */
export const SIM_WARN = Number(process.env["DEDUPE_WARN"] ?? 0.84);

/** Batas waktu total dedupe. Lewat ini, scrape lanjut tanpa hasil dedupe. */
const DEDUPE_TIMEOUT_MS = Number(process.env["DEDUPE_TIMEOUT_MS"] ?? 15_000);

export type DuplicateKind = "url" | "title" | "semantic";

export interface DuplicateHit {
  kind: DuplicateKind;
  id: string;
  title: string;
  where: "knowledge_base" | "draft";
  similarity: number;
  status?: string;
  submittedBy?: string;
}

export interface DuplicateReport {
  isDuplicate: boolean;
  needsReview: boolean;
  hits: DuplicateHit[];
  /**
   * true = ada lapis yang gagal, jadi hasil ini TIDAK LENGKAP.
   * UI wajib menampilkan "cek duplikat tidak tersedia" (abu-abu),
   * BUKAN "aman, topik belum ada" (hijau). Jangan berbohong ke kontributor.
   */
  degraded: boolean;
  /** Lapis mana yang gagal. Untuk debugging, aman ditampilkan ke admin. */
  failedLayers?: DuplicateKind[];
}

/**
 * Ambil pesan Postgres yang SEBENARNYA dari error drizzle.
 * drizzle >= 0.44 membungkus error DB dalam DrizzleQueryError yang menyimpan
 * `query` + `params`. Kalau objek itu dilempar mentah ke pino, params-nya
 * (1536 float) ikut ke-dump dan pesan aslinya ketimbun. Jadi kita ekstrak
 * pesannya saja, dan JANGAN PERNAH log objek error-nya utuh.
 */
function dbErrorMessage(err: unknown): string {
  const e = err as { message?: string; cause?: { message?: string; code?: string } };
  const cause = e?.cause;
  const msg = cause?.message ?? e?.message ?? "unknown error";
  const code = cause?.code ? ` [${cause.code}]` : "";
  return `${msg}${code}`.slice(0, 300);
}

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Kemiripan judul berbasis token (Jaccard). */
function titleSimilarity(a: string, b: string): number {
  const A = new Set(normalizeTitle(a).split(" ").filter((w) => w.length > 2));
  const B = new Set(normalizeTitle(b).split(" ").filter((w) => w.length > 2));
  if (A.size === 0 || B.size === 0) return 0;

  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;

  return inter / (A.size + B.size - inter);
}

/** Buang URL tracking (?utm_source=...) supaya link yang sama tidak lolos. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|igshid|ref|source)/i.test(k)) u.searchParams.delete(k);
    }
    const s = u.toString().replace(/\/$/, "");
    return s.replace(/^https?:\/\/(www\.)?/i, "");
  } catch {
    return raw.trim();
  }
}

// ─── LAPIS 1: URL sama persis ───────────────────────────────────────────────

async function layerUrl(sourceUrl: string, excludeDraftId?: string): Promise<DuplicateHit[]> {
  const canon = canonicalUrl(sourceUrl);

  const rows = await db
    .select({
      id: scraperDraftsTable.id,
      title: scraperDraftsTable.title,
      status: scraperDraftsTable.status,
      submittedBy: scraperDraftsTable.submittedBy,
    })
    .from(scraperDraftsTable)
    .where(
      and(
        isNotNull(scraperDraftsTable.sourceUrl),
        ne(scraperDraftsTable.status, "rejected"),
        excludeDraftId ? ne(scraperDraftsTable.id, excludeDraftId) : undefined,
        sql`regexp_replace(regexp_replace(${scraperDraftsTable.sourceUrl}, '^https?://(www\\.)?', ''), '/$', '') = ${canon}`,
      ),
    )
    .limit(5);

  return rows.map((d) => ({
    kind: "url" as const,
    id: d.id,
    title: d.title,
    where: "draft" as const,
    similarity: 1,
    status: d.status,
    submittedBy: d.submittedBy,
  }));
}

// ─── LAPIS 3: makna (pgvector) ──────────────────────────────────────────────

async function layerSemantic(title: string, content: string): Promise<DuplicateHit[]> {
  const embedding = await generateEmbedding(`${title}\n\n${content}`);

  if (!embedding) {
    // Bukan error — cuma tidak ada API key / provider lagi ngambek.
    // Lapis judul akan mengambil alih.
    logger.warn("[dedupe] Embedding tidak tersedia - lapis semantik dilewati");
    return [];
  }

  // Kolom produksi adalah vector(1536). Kirim dimensi lain = Postgres menolak
  // dengan "different vector dimensions". Lebih baik dicegat di sini.
  if (embedding.length !== KB_EMBEDDING_DIMENSIONS) {
    logger.error(
      { got: embedding.length, expected: KB_EMBEDDING_DIMENSIONS },
      "[dedupe] Dimensi embedding tidak cocok dengan kolom knowledge_base - lapis semantik dilewati",
    );
    return [];
  }

  const vec = `[${embedding.join(",")}]`;

  // CTE dipakai supaya vektor cuma dikirim SEKALI sebagai parameter,
  // bukan dua kali (SELECT + ORDER BY) seperti versi lama.
  //
  // Cast ditulis `::extensions.vector` DENGAN FALLBACK di db/index.ts:
  // di Supabase, pgvector hidup di schema `extensions`, bukan `public`.
  // Kalau `extensions` tidak ada di search_path koneksi, `::vector` gagal
  // dengan `type "vector" does not exist` — inilah sumber 500 kemarin.
  // Perbaikan search_path ada di lib/db/src/index.ts (pool.on("connect")).
  const rows = await db.execute<{ id: string; title: string; similarity: number }>(sql`
    WITH q AS (SELECT ${vec}::vector AS v)
    SELECT kb.id, kb.title, 1 - (kb.embedding <=> q.v) AS similarity
    FROM knowledge_base kb, q
    WHERE kb.embedding IS NOT NULL
      AND kb.status IS DISTINCT FROM 'rejected'
    ORDER BY kb.embedding <=> q.v
    LIMIT 5
  `);

  const hits: DuplicateHit[] = [];
  for (const r of rows.rows) {
    const similarity = Number(r.similarity);
    if (Number.isFinite(similarity) && similarity >= SIM_WARN) {
      hits.push({
        kind: "semantic",
        id: r.id,
        title: r.title,
        where: "knowledge_base",
        similarity,
      });
    }
  }
  return hits;
}

// ─── LAPIS 2: judul mirip ───────────────────────────────────────────────────

async function layerTitle(title: string): Promise<DuplicateHit[]> {
  const recent = await db
    .select({ id: knowledgeBaseTable.id, title: knowledgeBaseTable.title })
    .from(knowledgeBaseTable)
    .where(ne(knowledgeBaseTable.status, "rejected"))
    .limit(500);

  const hits: DuplicateHit[] = [];
  for (const a of recent) {
    const s = titleSimilarity(title, a.title);
    if (s >= 0.6) {
      hits.push({ kind: "title", id: a.id, title: a.title, where: "knowledge_base", similarity: s });
    }
  }
  return hits;
}

// ─── Orkestrator ────────────────────────────────────────────────────────────

const EMPTY: DuplicateReport = { isDuplicate: false, needsReview: false, hits: [], degraded: true };

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout setelah ${ms}ms`)), ms),
    ),
  ]);
}

async function runLayers(opts: {
  title: string;
  content: string;
  sourceUrl?: string | null;
  excludeDraftId?: string;
}): Promise<DuplicateReport> {
  const hits: DuplicateHit[] = [];
  const failed: DuplicateKind[] = [];

  // LAPIS 1 — URL
  if (opts.sourceUrl) {
    try {
      hits.push(...(await layerUrl(opts.sourceUrl, opts.excludeDraftId)));
    } catch (err) {
      failed.push("url");
      logger.error({ layer: "url", reason: dbErrorMessage(err) }, "[dedupe] Lapis URL gagal - dilewati");
    }
  }

  // LAPIS 3 — semantik
  let semanticOk = false;
  try {
    hits.push(...(await layerSemantic(opts.title, opts.content)));
    semanticOk = true;
  } catch (err) {
    failed.push("semantic");
    logger.error(
      { layer: "semantic", reason: dbErrorMessage(err) },
      "[dedupe] Lapis semantik gagal - dilewati. Cek: pgvector ada di search_path? " +
        "Jalankan: SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'vector';",
    );
  }

  // LAPIS 2 — judul.
  // Jalan kalau lapis semantik MATI, atau kalau dia hidup tapi tidak menemukan
  // apa pun. Versi lama cuma cek "tidak ada hit semantik", jadi kalau lapis 3
  // error, jaring pengamannya ikut hilang tanpa disadari.
  const noSemanticHits = !hits.some((h) => h.kind === "semantic");
  if (!semanticOk || noSemanticHits) {
    try {
      hits.push(...(await layerTitle(opts.title)));
    } catch (err) {
      failed.push("title");
      logger.error({ layer: "title", reason: dbErrorMessage(err) }, "[dedupe] Lapis judul gagal - dilewati");
    }
  }

  hits.sort((a, b) => b.similarity - a.similarity);
  const top = hits.slice(0, 5);

  return {
    isDuplicate: top.some((h) => h.kind === "url" || h.similarity >= SIM_STRONG),
    needsReview: top.some((h) => h.similarity >= SIM_WARN),
    hits: top,
    degraded: failed.length > 0,
    ...(failed.length > 0 ? { failedLayers: failed } : {}),
  };
}

/**
 * Cek duplikat. DIJAMIN TIDAK PERNAH THROW dan tidak pernah menggantung.
 * Aman dipanggil dari jalur utama scrape.
 */
export async function findDuplicates(opts: {
  title: string;
  content: string;
  sourceUrl?: string | null;
  excludeDraftId?: string;
}): Promise<DuplicateReport> {
  try {
    return await withTimeout(runLayers(opts), DEDUPE_TIMEOUT_MS, "dedupe");
  } catch (err) {
    // Sabuk pengaman terakhir. Apa pun yang meledak di dalam, scrape TETAP sukses.
    logger.error({ reason: dbErrorMessage(err) }, "[dedupe] Gagal total - scrape tetap dilanjutkan");
    return { ...EMPTY, failedLayers: ["url", "title", "semantic"] };
  }
}
