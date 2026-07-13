import { Router, type IRouter } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { db, scraperDraftsTable, knowledgeBaseTable } from "@workspace/db";
import {
  CreateDraftBody,
  UpdateDraftBody,
  GetDraftParams,
  UpdateDraftParams,
  DeleteDraftParams,
  SubmitDraftParams,
  ApproveDraftParams,
  RejectDraftParams,
  RejectDraftBody,
  ListDraftsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { processAndStoreArticle } from "../lib/contentProcessor";
import { classifyKbCategory } from "../lib/scrapeUtils";
import { SCRAPER_AUTHOR_ID } from "../lib/env";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// List drafts
router.get("/drafts", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const queryParsed = ListDraftsQueryParams.safeParse(req.query);
  const page = queryParsed.success ? (queryParsed.data.page ?? 1) : 1;
  const limit = queryParsed.success ? (queryParsed.data.limit ?? 20) : 20;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (user.role === "contributor") {
    conditions.push(eq(scraperDraftsTable.submittedBy, user.username));
  }
  if (queryParsed.success && queryParsed.data.status) {
    conditions.push(eq(scraperDraftsTable.status, queryParsed.data.status));
  }
  if (queryParsed.success && queryParsed.data.source_type) {
    conditions.push(eq(scraperDraftsTable.sourceType, queryParsed.data.source_type as typeof scraperDraftsTable.sourceType.enumValues[number]));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [drafts, [{ total }]] = await Promise.all([
    db.select().from(scraperDraftsTable)
      .where(where)
      .orderBy(desc(scraperDraftsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(scraperDraftsTable).where(where),
  ]);

  res.json({
    data: drafts.map(toDraftResponse),
    total,
    page,
    limit,
  });
});

// Create draft
router.post("/drafts", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const parsed = CreateDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [draft] = await db.insert(scraperDraftsTable).values({
    ...parsed.data,
    sourceType: parsed.data.source_type as typeof scraperDraftsTable.sourceType.enumValues[number],
    submittedBy: user.username,
    relevanceScore: parsed.data.relevance_score ?? 0,
    status: "draft",
  }).returning();

  res.status(201).json(toDraftResponse(draft));
});

// Get single draft
router.get("/drafts/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = req.user!;
  const [draft] = await db.select().from(scraperDraftsTable).where(eq(scraperDraftsTable.id, params.data.id));

  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  if (user.role === "contributor" && draft.submittedBy !== user.username) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(toDraftResponse(draft));
});

// Update draft
router.patch("/drafts/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = req.user!;
  const [existing] = await db.select().from(scraperDraftsTable).where(eq(scraperDraftsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }
  if (user.role === "contributor" && existing.submittedBy !== user.username) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [draft] = await db.update(scraperDraftsTable)
    .set(parsed.data)
    .where(eq(scraperDraftsTable.id, params.data.id))
    .returning();

  res.json(toDraftResponse(draft));
});

// Delete draft
router.delete("/drafts/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = req.user!;
  const [existing] = await db.select().from(scraperDraftsTable).where(eq(scraperDraftsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }
  if (user.role === "contributor" && existing.submittedBy !== user.username) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(scraperDraftsTable).where(eq(scraperDraftsTable.id, params.data.id));
  res.sendStatus(204);
});

// Submit draft for admin review
router.post("/drafts/:id/submit", requireAuth, async (req, res): Promise<void> => {
  const params = SubmitDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = req.user!;
  const [existing] = await db.select().from(scraperDraftsTable).where(eq(scraperDraftsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }
  if (user.role === "contributor" && existing.submittedBy !== user.username) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (existing.relevanceScore <= 50) {
    res.status(400).json({ error: "Draft relevance score too low (≤50). Cannot submit." });
    return;
  }

  const [draft] = await db.update(scraperDraftsTable)
    .set({ status: "submitted" })
    .where(eq(scraperDraftsTable.id, params.data.id))
    .returning();

  res.json(toDraftResponse(draft));
});

// Approve draft (admin)
router.post("/drafts/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const params = ApproveDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(scraperDraftsTable).where(eq(scraperDraftsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  // ---------------------------------------------------------------------
  // Insert ke knowledge_base milik AINA.
  //
  // Tabel itu punya constraint yang HARUS dipenuhi (versi lama tidak, sehingga
  // setiap approve gagal):
  //   - author_id    NOT NULL, tanpa default -> SCRAPER_AUTHOR_ID
  //   - category     NOT NULL, tanpa default -> harus 1 dari 6 kategori valid
  //   - article_type NOT NULL
  // Kolom `source` dan `chunk_index` TIDAK ADA di tabel produksi — jangan
  // ditulis lagi. Jejak sumber tetap tersimpan di scraper_drafts.
  // ---------------------------------------------------------------------
  const category = await classifyKbCategory(existing.title, existing.content);

  let newKbEntry;
  try {
    [newKbEntry] = await db
      .insert(knowledgeBaseTable)
      .values({
        authorId: SCRAPER_AUTHOR_ID,
        title: existing.title,
        content: existing.content,
        category,
        // 'pending' = menunggu tinjauan akhir di AINA sebelum dipakai publik.
        status: "pending",
        articleType: "narrative",
        summary: existing.summary,
        keywords: existing.tags,
      })
      .returning();
  } catch (err) {
    logger.error({ err, draftId: existing.id }, "[approve] Insert knowledge_base gagal");
    res.status(500).json({
      error: "Gagal menyimpan ke knowledge base. Cek log server untuk detail.",
    });
    return;
  }

  // Generate embedding di background — respons approve tidak menunggu OpenAI.
  processAndStoreArticle(newKbEntry!.id, existing.title, existing.content).catch(
    (err) => logger.error({ err }, "[approve] processAndStoreArticle gagal"),
  );

  const [draft] = await db.update(scraperDraftsTable)
    .set({ status: "approved" })
    .where(eq(scraperDraftsTable.id, params.data.id))
    .returning();

  res.json(toDraftResponse(draft));
});

// Reject draft (admin)
router.post("/drafts/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const params = RejectDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = RejectDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(scraperDraftsTable).where(eq(scraperDraftsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  const [draft] = await db.update(scraperDraftsTable)
    .set({ status: "rejected", rejectionReason: parsed.data.rejection_reason })
    .where(eq(scraperDraftsTable.id, params.data.id))
    .returning();

  res.json(toDraftResponse(draft));
});

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

export default router;
