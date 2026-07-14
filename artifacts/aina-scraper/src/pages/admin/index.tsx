import { useState, useEffect, useCallback } from 'react';
import {
  useListDrafts,
  useApproveDraft,
  useRejectDraft,
  getListDraftsQueryKey,
  customFetch,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  CheckCircle2, Clock, TrendingUp, XCircle, Users2,
  ShieldCheck, Eye, Sparkles, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { PageShell } from '@/components/PageShell';
import { Pager } from '@/components/Pager';
import { stripMarkdown } from '@/components/Markdown';

type TeamStats = {
  pending_review: number;
  today_approved: number;
  total_approved: number;
  avg_daily_input: number;
  top_contributors: { username: string; count: number; rank: number }[];
  team_today_total: number;
  team_daily_target: number;
  team_progress_percent: number;
};

/**
 * 5 baris per halaman. Angka ini dipilih supaya antrean SELALU muat di layar
 * tanpa scroll — dulu semua draft ditumpuk ke bawah dan halaman jadi panjang.
 */
const PAGE_SIZE = 5;

export default function AdminDashboardPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchTeamStats = useCallback(async () => {
    try {
      setTeamStats(await customFetch<TeamStats>('/api/stats/team'));
    } catch (err) {
      console.error('[dashboard] Gagal memuat statistik tim:', err);
      toast.error('Gagal memuat statistik tim.');
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchTeamStats(); }, [fetchTeamStats]);

  const draftsQuery = { status: 'submitted' as const, page, limit: PAGE_SIZE };
  const { data: draftsList, isLoading: isDraftsLoading } = useListDrafts(draftsQuery);

  const approveMutation = useApproveDraft();
  const rejectMutation = useRejectDraft();
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListDraftsQueryKey(draftsQuery) });
    void fetchTeamStats();
  };

  const handleApprove = (draftId: string) => {
    approveMutation.mutate({ id: draftId }, {
      onSuccess: () => { toast.success('Draft disetujui & masuk Knowledge Base AINA'); refresh(); },
      onError: (e) => toast.error((e as Error).message || 'Gagal menyetujui draft'),
    });
  };

  const handleReject = () => {
    if (!rejectDialogId) return;
    rejectMutation.mutate(
      { id: rejectDialogId, data: { rejection_reason: rejectionReason } },
      {
        onSuccess: () => {
          toast.success('Draft ditolak & dikembalikan ke kontributor');
          setRejectDialogId(null);
          setRejectionReason('');
          refresh();
        },
        onError: (e) => toast.error((e as Error).message || 'Gagal menolak draft'),
      },
    );
  };

  const scoreClass = (s: number) =>
    s >= 75 ? 'text-success' : s >= 50 ? 'text-warning' : 'text-destructive';

  const stats = [
    { label: 'Perlu Review', value: teamStats?.pending_review ?? 0, icon: Clock, accent: true },
    { label: 'Disetujui Hari Ini', value: teamStats?.today_approved ?? 0, icon: CheckCircle2 },
    { label: 'Total di Knowledge Base', value: teamStats?.total_approved ?? 0, icon: ShieldCheck },
    { label: 'Kontributor Aktif', value: teamStats?.top_contributors?.length ?? 0, icon: Users2 },
  ];

  const drafts = draftsList?.data ?? [];
  const total = draftsList?.total ?? 0;

  return (
    <PageShell
      title="Dashboard Admin"
      description="Tinjau antrean draft dan pantau kinerja tim."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setLocation('/admin/users')}>
            <Users2 className="w-4 h-4 mr-2" /> Pengguna
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLocation('/knowledge-base')}>
            <ShieldCheck className="w-4 h-4 mr-2" /> Knowledge Base
          </Button>
        </>
      }
      footer={
        <Pager page={page} total={total} limit={PAGE_SIZE} onPage={setPage} label="draft menunggu" />
      }
    >
      {/* Kartu statistik — ringkas, satu baris */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {stats.map((s) => (
          <Card key={s.label} className={s.accent ? 'bg-primary/10 border-primary/20' : 'bg-card border-border/50'}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.accent ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              </div>
              {isStatsLoading
                ? <div className="h-7 w-12 bg-muted animate-pulse rounded" />
                : <div className="text-2xl font-bold tabular-nums">{s.value}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progres tim — satu baris tipis */}
      <div className="shrink-0 flex items-center gap-3 mb-4 px-1">
        <TrendingUp className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Misi Tim: <b className="text-foreground">{teamStats?.team_today_total ?? 0}</b> / {teamStats?.team_daily_target ?? 0}
        </span>
        <Progress value={teamStats?.team_progress_percent ?? 0} className="h-1.5 flex-1" />
        <span className="text-xs font-semibold text-primary tabular-nums w-10 text-right">
          {teamStats?.team_progress_percent ?? 0}%
        </span>
      </div>

      {/* Antrean review — area ini yang menyusut, bukan halaman yang memanjang */}
      <h2 className="shrink-0 text-sm font-semibold mb-2 flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" /> Antrean Review
      </h2>

      <div className="flex-1 min-h-0 space-y-2">
        {isDraftsLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[68px] rounded-xl bg-card/40 animate-pulse" />
          ))
        ) : drafts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center border border-dashed border-border rounded-xl">
            <Sparkles className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium">Antrean bersih</p>
            <p className="text-xs text-muted-foreground">Tidak ada draft yang menunggu review.</p>
          </div>
        ) : (
          drafts.map((d) => (
            <Card key={d.id} className="border-border/50 bg-card/80">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase">{d.source_type}</Badge>
                    <span className={`text-xs font-semibold tabular-nums ${scoreClass(d.relevance_score)}`}>
                      {d.relevance_score}/100
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {d.submitted_by} · {format(new Date(d.created_at), 'd MMM HH:mm', { locale: localeId })}
                    </span>
                  </div>
                  <p className="text-sm font-semibold truncate">{d.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {stripMarkdown(d.summary || d.content, 90)}
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setLocation(`/drafts/${d.id}`)} title="Lihat & edit">
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    className="bg-success hover:bg-success/90 text-white h-8"
                    disabled={approveMutation.isPending}
                    onClick={() => handleApprove(d.id)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Setujui
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={() => setRejectDialogId(d.id)}
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={!!rejectDialogId} onOpenChange={(o) => !o && setRejectDialogId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Tolak Draft
            </DialogTitle>
            <DialogDescription>
              Alasan ini akan dikirim ke kontributor agar mereka bisa memperbaikinya.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Contoh: Sumber tidak kredibel / konten tidak relevan dengan Masisir."
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectDialogId(null)}>Batal</Button>
            <Button
              variant="destructive"
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
              onClick={handleReject}
            >
              Tolak Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
