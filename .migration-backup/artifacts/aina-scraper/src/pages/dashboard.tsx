import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customFetch, useListDrafts } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  CheckCircle2, XCircle, Clock, FileEdit, Target, Flame,
  PenTool, ChevronRight, Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { PageShell } from '@/components/PageShell';
import { Pager } from '@/components/Pager';
import { stripMarkdown } from '@/components/Markdown';
import { cn } from '@/lib/utils';

interface PersonalStats {
  total_submitted: number;
  today_submitted: number;
  this_month_submitted: number;
  daily_target: number;
  daily_progress_pct: number;
  mission_completed: boolean;
  draft_count: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  approval_rate: number | null;
}

/** Status yang bisa disaring. Inilah inti permintaan: mana yang lolos, mana yang ditolak. */
const TABS = [
  { key: undefined,     label: 'Semua',      icon: FileEdit,    color: 'text-foreground' },
  { key: 'draft',       label: 'Draft',      icon: FileEdit,    color: 'text-muted-foreground' },
  { key: 'submitted',   label: 'Menunggu',   icon: Clock,       color: 'text-primary' },
  { key: 'approved',    label: 'Disetujui',  icon: CheckCircle2,color: 'text-success' },
  { key: 'rejected',    label: 'Ditolak',    icon: XCircle,     color: 'text-destructive' },
] as const;

const PAGE_SIZE = 5;

export default function ContributorDashboardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const [page, setPage] = useState(1);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats-personal'],
    queryFn: () => customFetch<PersonalStats>('/api/stats/personal'),
  });

  // Server otomatis membatasi ke draft milik user sendiri untuk role contributor.
  const { data: list, isLoading: listLoading } = useListDrafts({
    page,
    limit: PAGE_SIZE,
    ...(tab.key ? { status: tab.key as 'draft' } : {}),
  });

  const drafts = list?.data ?? [];

  const counts: Record<string, number> = {
    draft: stats?.draft_count ?? 0,
    submitted: stats?.pending_count ?? 0,
    approved: stats?.approved_count ?? 0,
    rejected: stats?.rejected_count ?? 0,
  };

  const cards = [
    { label: 'Disetujui', value: stats?.approved_count ?? 0, icon: CheckCircle2, cls: 'text-success' },
    { label: 'Ditolak',   value: stats?.rejected_count ?? 0, icon: XCircle,      cls: 'text-destructive' },
    { label: 'Menunggu',  value: stats?.pending_count ?? 0,  icon: Clock,        cls: 'text-primary' },
    { label: 'Draft',     value: stats?.draft_count ?? 0,    icon: FileEdit,     cls: 'text-muted-foreground' },
  ];

  const statusBadge = (s: string) => {
    const map: Record<string, { text: string; cls: string; Icon: typeof Clock }> = {
      draft:     { text: 'Draft',     cls: 'text-muted-foreground border-border',            Icon: FileEdit },
      submitted: { text: 'Menunggu',  cls: 'text-primary border-primary/30 bg-primary/5',    Icon: Clock },
      approved:  { text: 'Disetujui', cls: 'text-success border-success/30 bg-success/5',    Icon: CheckCircle2 },
      rejected:  { text: 'Ditolak',   cls: 'text-destructive border-destructive/30 bg-destructive/5', Icon: XCircle },
    };
    const m = map[s] ?? map['draft']!;
    return (
      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', m.cls)}>
        <m.Icon className="w-3 h-3 mr-1" /> {m.text}
      </Badge>
    );
  };

  return (
    <PageShell
      title={`Halo, ${user?.username ?? ''}`}
      description="Ringkasan kontribusimu dan status setiap artikel."
      actions={
        <Button size="sm" onClick={() => setLocation('/input')}>
          <PenTool className="w-4 h-4 mr-2" /> Input Baru
        </Button>
      }
      footer={
        <Pager page={page} total={list?.total ?? 0} limit={PAGE_SIZE} onPage={setPage} label="artikel" />
      }
    >
      {/* Misi harian */}
      <Card className={cn(
        'shrink-0 mb-3',
        stats?.mission_completed
          ? 'bg-success/10 border-success/30'
          : 'bg-primary/10 border-primary/20',
      )}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            {stats?.mission_completed
              ? <Flame className="w-4 h-4 text-success" />
              : <Target className="w-4 h-4 text-primary" />}
            <span className="text-xs font-semibold">
              {stats?.mission_completed ? 'Misi harian tercapai! 🔥' : 'Misi Harian'}
            </span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              <b className="text-foreground">{stats?.today_submitted ?? 0}</b> / {stats?.daily_target ?? 0} artikel
            </span>
          </div>
          <Progress
            value={stats?.daily_progress_pct ?? 0}
            className={cn('h-2', stats?.mission_completed && '[&>div]:bg-success')}
          />
        </CardContent>
      </Card>

      {/* Kartu status — grid 2 kolom di ponsel, 4 di desktop */}
      <div className="shrink-0 grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {cards.map((c) => (
          <Card key={c.label} className="bg-card border-border/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <c.icon className={cn('w-3.5 h-3.5', c.cls)} />
                <span className="text-[11px] text-muted-foreground">{c.label}</span>
              </div>
              {statsLoading
                ? <div className="h-6 w-8 bg-muted animate-pulse rounded" />
                : <div className={cn('text-xl font-bold tabular-nums', c.cls)}>{c.value}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tingkat kelulusan — bantu kontributor memperbaiki diri */}
      {stats?.approval_rate !== null && stats?.approval_rate !== undefined && (
        <div className="shrink-0 flex items-center gap-2 mb-3 px-1 text-xs text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          Tingkat kelulusan artikelmu:{' '}
          <b className={cn(
            'tabular-nums',
            stats.approval_rate >= 70 ? 'text-success' : stats.approval_rate >= 40 ? 'text-warning' : 'text-destructive',
          )}>
            {stats.approval_rate}%
          </b>
          <span className="text-muted-foreground/70">
            ({stats.approved_count} lolos dari {stats.approved_count + stats.rejected_count} yang direview)
          </span>
        </div>
      )}

      {/* Tab penyaring status — bisa digeser di ponsel */}
      <div className="shrink-0 flex gap-1.5 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => {
          const active = t.key === tab.key;
          const n = t.key ? counts[t.key] : stats?.total_submitted;
          return (
            <button
              key={t.label}
              onClick={() => { setTab(t); setPage(1); }}
              className={cn(
                'shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-full border text-xs font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {n !== undefined && (
                <span className={cn(
                  'tabular-nums rounded-full px-1.5 text-[10px]',
                  active ? 'bg-primary-foreground/20' : 'bg-muted',
                )}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Daftar artikel */}
      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
        {listLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[72px] rounded-xl bg-card/40 animate-pulse" />
          ))
        ) : drafts.length === 0 ? (
          <div className="h-full min-h-32 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-xl p-6">
            <FileEdit className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium">Belum ada artikel di sini</p>
            <p className="text-xs text-muted-foreground mb-3">
              {tab.key === 'rejected'
                ? 'Bagus — belum ada artikelmu yang ditolak.'
                : 'Mulai dengan input artikel baru.'}
            </p>
            {!tab.key && (
              <Button size="sm" onClick={() => setLocation('/input')}>
                <PenTool className="w-4 h-4 mr-2" /> Input Artikel
              </Button>
            )}
          </div>
        ) : (
          drafts.map((d) => (
            <Card
              key={d.id}
              className="border-border/50 bg-card/80 cursor-pointer hover:border-primary/40 transition-colors active:scale-[0.99]"
              onClick={() => setLocation(`/drafts/${d.id}`)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  {statusBadge(d.status)}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase shrink-0">
                    {d.source_type}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground ml-auto shrink-0">
                    {format(new Date(d.created_at), 'd MMM', { locale: localeId })}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>

                <p className="text-sm font-semibold line-clamp-1">{d.title}</p>

                {/* Alasan penolakan = umpan balik paling berharga bagi kontributor */}
                {d.status === 'rejected' && d.rejection_reason ? (
                  <p className="text-xs text-destructive mt-1 line-clamp-2">
                    <b>Alasan ditolak:</b> {d.rejection_reason}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {stripMarkdown(d.summary || d.content, 90)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </PageShell>
  );
}
