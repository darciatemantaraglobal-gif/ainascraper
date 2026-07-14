import { Router, type IRouter } from "express";
import { count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, knowledgeBaseTable } from "@workspace/db";
import { ListKnowledgeBaseQueryParams } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { SIM_STRONG, SIM_WARN, findDuplicates } from "../lib/dedupe";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/knowledge-base", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListKnowledgeBaseQueryParams.safeParse(req.query);
  const page = parsed.success ? (parsed.data.page ?? 1) : 1;
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;
  const offset = (page - 1) * limit;

  // Jangan SELECT kolom embedding: vector(1536) per baris = payload raksasa
  // yang tidak dipakai UI. Cukup kirim flag "punya embedding".
  const [articles, [{ total }]] = await Promise.all([
    db
      .select({
        id: knowledgeBaseTable.id,
        title: knowledgeBaseTable.title,
        content: knowledgeBaseTable.content,
        category: knowledgeBaseTable.category,
        status: knowledgeBaseTable.status,
        hasEmbedding: isNotNull(knowledgeBaseTable.embedding),
      })
      .from(knowledgeBaseTable)
      .orderBy(desc(knowledgeBaseTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(knowledgeBaseTable),
  ]);

  res.json({
    data: articles.map((a) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      category: a.category,
      status: a.status,
      has_embedding: a.hasEmbedding,
    })),
    total,
    page,
    limit,
  });
});

/**
 * GET /knowledge-base/duplicates  (admin)
 *
 * Cari pasangan artikel yang MIRIP SECARA MAKNA di dalam knowledge_base.
 *
 * Caranya: self-join pgvector. Untuk tiap artikel, ambil tetangga terdekatnya;
 * kalau cosine similarity >= ambang, pasangan itu dilaporkan.
 *
 * Syarat `a.id < b.id` mencegah pasangan ganda (A-B dan B-A) dan
 * perbandingan artikel dengan dirinya sendiri.
 */
router.get("/knowledge-base/duplicates", requireAdmin, async (req, res): Promise<void> => {
  const threshold = Math.min(
    0.99,
    Math.max(0.5, Number(req.query["threshold"] ?? SIM_WARN)),
  );

  const rows = await db.execute<{
    a_id: string; a_title: string; a_category: string; a_created: string;
    b_id: string; b_title: string; b_category: string; b_created: string;
    similarity: number;
  }>(sql`
    SELECT
      a.id         AS a_id,
      a.title      AS a_title,
      a.category   AS a_category,
      a.created_at AS a_created,
      b.id         AS b_id,
      b.title      AS b_title,
      b.category   AS b_category,
      b.created_at AS b_created,
      1 - (a.embedding <=> b.embedding) AS similarity
    FROM knowledge_base a
    JOIN knowledge_base b
      ON a.id < b.id
    WHERE a.embedding IS NOT NULL
      AND b.embedding IS NOT NULL
      AND a.status <> 'rejected'
      AND b.status <> 'rejected'
      AND 1 - (a.embedding <=> b.embedding) >= ${threshold}
    ORDER BY similarity DESC
    LIMIT 100
  `);

  res.json({
    threshold,
    strong_threshold: SIM_STRONG,
    pairs: rows.rows.map((r) => ({
      similarity: Number(r.similarity),
      a: { id: r.a_id, title: r.a_title, category: r.a_category, created_at: r.a_created },
      b: { id: r.b_id, title: r.b_title, category: r.b_category, created_at: r.b_created },
    })),
  });
});

/** POST /knowledge-base/check — cek apakah sebuah topik sudah ada (dipakai kontributor). */
router.post("/knowledge-base/check", requireAuth, async (req, res): Promise<void> => {
  const { title, content, source_url } = req.body as {
    title?: string; content?: string; source_url?: string;
  };

  if (!title?.trim() && !content?.trim()) {
    res.status(400).json({ error: "Butuh minimal judul atau konten untuk dicek." });
    return;
  }

  const report = await findDuplicates({
    title: title ?? "",
    content: content ?? "",
    sourceUrl: source_url ?? null,
  });

  res.json(report);
});

/** DELETE /knowledge-base/:id  (admin) — hapus artikel duplikat. */
router.delete("/knowledge-base/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = String(req.params["id"]);

  const [deleted] = await db
    .delete(knowledgeBaseTable)
    .where(eq(knowledgeBaseTable.id, id))
    .returning({ id: knowledgeBaseTable.id, title: knowledgeBaseTable.title });

  if (!deleted) {
    res.status(404).json({ error: "Artikel tidak ditemukan." });
    return;
  }

  logger.warn(
    { id: deleted.id, title: deleted.title, by: req.user?.username },
    "[knowledge-base] Artikel DIHAPUS admin",
  );

  res.json({ ok: true, deleted });
});

export default router;
