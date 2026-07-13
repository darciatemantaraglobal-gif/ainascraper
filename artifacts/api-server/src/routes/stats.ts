import { Router, type IRouter } from "express";
import { eq, and, count, sql, desc } from "drizzle-orm";
import { db, scraperDraftsTable, scraperUsersTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { startOfTodayInAppTz, startOfMonthInAppTz } from "../lib/time";


const router: IRouter = Router();

router.get("/stats/personal", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const todayStart = startOfTodayInAppTz();
  const monthStart = startOfMonthInAppTz();

  const [userData] = await db.select().from(scraperUsersTable).where(eq(scraperUsersTable.username, user.username));
  const dailyTarget = userData?.dailyTarget ?? 3;

  const mine = eq(scraperDraftsTable.submittedBy, user.username);

  const [
    [{ totalSubmitted }],
    [{ todaySubmitted }],
    [{ thisMonthSubmitted }],
    byStatus,
  ] = await Promise.all([
    db.select({ totalSubmitted: count() }).from(scraperDraftsTable).where(mine),
    db.select({ todaySubmitted: count() }).from(scraperDraftsTable)
      .where(and(mine, sql`${scraperDraftsTable.createdAt} >= ${todayStart.toISOString()}`)),
    db.select({ thisMonthSubmitted: count() }).from(scraperDraftsTable)
      .where(and(mine, sql`${scraperDraftsTable.createdAt} >= ${monthStart.toISOString()}`)),
    // Rincian per status — inilah yang dibutuhkan kontributor untuk tahu
    // artikel mana yang sudah disetujui dan mana yang ditolak.
    db.select({ status: scraperDraftsTable.status, n: count() })
      .from(scraperDraftsTable)
      .where(mine)
      .groupBy(scraperDraftsTable.status),
  ]);

  const tally = (s: string) => byStatus.find((r) => r.status === s)?.n ?? 0;

  const approved = tally("approved");
  const rejected = tally("rejected");
  const reviewed = approved + rejected;

  const dailyProgressPct = Math.min(100, Math.round((todaySubmitted / dailyTarget) * 100));

  res.json({
    total_submitted: totalSubmitted,
    today_submitted: todaySubmitted,
    this_month_submitted: thisMonthSubmitted,
    daily_target: dailyTarget,
    daily_progress_pct: dailyProgressPct,
    mission_completed: todaySubmitted >= dailyTarget,

    // Rincian status
    draft_count: tally("draft"),           // masih dikerjakan, belum diajukan
    pending_count: tally("submitted"),     // menunggu review admin
    approved_count: approved,
    rejected_count: rejected,
    // Persentase draft yang lolos review. null kalau belum ada yang direview,
    // supaya UI tidak menampilkan "0%" yang menyesatkan bagi user baru.
    approval_rate: reviewed === 0 ? null : Math.round((approved / reviewed) * 100),
  });
});

router.get("/stats/team", requireAdmin, async (req, res): Promise<void> => {
  const todayStart = startOfTodayInAppTz();

  const [
    [{ totalDrafts }],
    [{ totalApproved }],
    [{ pendingReview }],
    [{ todayApproved }],
    topContributors,
    [{ teamTodayTotal }],
    [{ teamDailyTarget }],
  ] = await Promise.all([
    db.select({ totalDrafts: count() }).from(scraperDraftsTable),
    db.select({ totalApproved: count() }).from(scraperDraftsTable).where(eq(scraperDraftsTable.status, "approved")),
    db.select({ pendingReview: count() }).from(scraperDraftsTable).where(eq(scraperDraftsTable.status, "submitted")),
    db.select({ todayApproved: count() }).from(scraperDraftsTable)
      .where(and(
        eq(scraperDraftsTable.status, "approved"),
        sql`${scraperDraftsTable.createdAt} >= ${todayStart.toISOString()}`
      )),
    db.select({
      username: scraperDraftsTable.submittedBy,
      count: count(),
    }).from(scraperDraftsTable)
      .where(sql`${scraperDraftsTable.createdAt} >= ${todayStart.toISOString()}`)
      .groupBy(scraperDraftsTable.submittedBy)
      .orderBy(desc(count()))
      .limit(3),
    db.select({ teamTodayTotal: count() }).from(scraperDraftsTable)
      .where(sql`${scraperDraftsTable.createdAt} >= ${todayStart.toISOString()}`),
    db.select({
      teamDailyTarget: sql<number>`COALESCE(SUM(${scraperUsersTable.dailyTarget}), 0)`,
    }).from(scraperUsersTable).where(eq(scraperUsersTable.role, "contributor")),
  ]);

  const topContributorsFormatted = topContributors.map((c, i) => ({
    username: c.username,
    count: c.count,
    rank: i + 1,
  }));

  const teamDailyTargetNum = Number(teamDailyTarget) || 1;
  const teamProgressPercent = Math.min(100, Math.round((teamTodayTotal / teamDailyTargetNum) * 100));

  res.json({
    total_drafts: totalDrafts,
    total_approved: totalApproved,
    pending_review: pendingReview,
    today_approved: todayApproved,
    avg_daily_input: Math.round(totalDrafts / 30),
    top_contributors: topContributorsFormatted,
    team_today_total: teamTodayTotal,
    team_daily_target: teamDailyTargetNum,
    team_progress_percent: teamProgressPercent,
  });
});

// GET /stats/contributors — daftar kontributor dengan daily_target
router.get("/stats/contributors", requireAdmin, async (req, res): Promise<void> => {
  const contributors = await db
    .select({ username: scraperUsersTable.username, dailyTarget: scraperUsersTable.dailyTarget })
    .from(scraperUsersTable)
    .where(eq(scraperUsersTable.role, "contributor"))
    .orderBy(scraperUsersTable.username);

  res.json(contributors.map(u => ({ username: u.username, daily_target: u.dailyTarget })));
});

// PATCH /stats/contributors/:username/target — update target harian kontributor
router.patch("/stats/contributors/:username/target", requireAdmin, async (req, res): Promise<void> => {
  const username = req.params.username as string;
  const { daily_target } = req.body as { daily_target: unknown };

  if (!Number.isInteger(daily_target) || (daily_target as number) < 1) {
    res.status(400).json({ error: "daily_target harus integer >= 1" });
    return;
  }

  const [user] = await db
    .update(scraperUsersTable)
    .set({ dailyTarget: daily_target as number })
    .where(eq(scraperUsersTable.username, username))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ username: user.username, daily_target: user.dailyTarget });
});

router.get("/stats/leaderboard", requireAuth, async (req, res): Promise<void> => {
  const todayStart = startOfTodayInAppTz();

  const leaderboard = await db.select({
    username: scraperDraftsTable.submittedBy,
    count: count(),
  }).from(scraperDraftsTable)
    .where(sql`${scraperDraftsTable.createdAt} >= ${todayStart.toISOString()}`)
    .groupBy(scraperDraftsTable.submittedBy)
    .orderBy(desc(count()))
    .limit(10);

  res.json(leaderboard.map((entry, i) => ({
    username: entry.username,
    count: entry.count,
    rank: i + 1,
  })));
});

export default router;
