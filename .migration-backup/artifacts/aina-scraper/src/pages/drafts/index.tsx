import React, { useState } from 'react';
import { useGetPersonalStats, useListDrafts } from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import { 
  Target, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileText,
  ChevronRight,
  Plus
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { PageShell } from '@/components/PageShell';
import { Pager } from '@/components/Pager';
import { id } from 'date-fns/locale';

export default function DraftsPage() {
  const [_, setLocation] = useLocation();
  const { data: stats, isLoading: isStatsLoading } = useGetPersonalStats();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 6;
  const { data: draftsList, isLoading: isDraftsLoading } = useListDrafts({ page, limit: PAGE_SIZE });

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'draft': return <Badge variant="secondary" className="bg-secondary/50 text-secondary-foreground"><Clock className="w-3 h-3 mr-1" /> Draft</Badge>;
      case 'submitted': return <Badge variant="warning" className="bg-warning/20 text-warning border-warning/30"><Clock className="w-3 h-3 mr-1" /> Menunggu Review</Badge>;
      case 'approved': return <Badge variant="success" className="bg-success/20 text-success border-success/30"><CheckCircle2 className="w-3 h-3 mr-1" /> Disetujui</Badge>;
      case 'rejected': return <Badge variant="destructive" className="bg-destructive/20 text-destructive border-destructive/30"><AlertCircle className="w-3 h-3 mr-1" /> Ditolak</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-success font-semibold';
    if (score >= 50) return 'text-warning font-semibold';
    return 'text-destructive font-semibold';
  };

  return (
    <PageShell
      title="Draft Saya"
      description="Kelola draft pengetahuan yang kamu masukkan."
      actions={
        <Button onClick={() => setLocation('/input')}>
          <Plus className="w-4 h-4 mr-2" /> Input Baru
        </Button>
      }
      footer={
        <Pager
          page={page}
          total={draftsList?.total ?? 0}
          limit={PAGE_SIZE}
          onPage={setPage}
          label="draft"
        />
      }
    >

      {/* Stats Section — 3 kartu */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <FileText className="w-5 h-5" />
              </div>
              <Badge variant="outline" className="text-xs font-normal">Semua Waktu</Badge>
            </div>
            {isStatsLoading ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded mb-1" />
            ) : (
              <div className="text-3xl font-bold font-heading mb-1">{stats?.total_submitted ?? 0}</div>
            )}
            <p className="text-sm text-muted-foreground">Total Artikel</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center text-success">
                <Target className="w-5 h-5" />
              </div>
              <Badge variant="outline" className="text-xs font-normal">Hari Ini</Badge>
            </div>
            {isStatsLoading ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded mb-1" />
            ) : (
              <div className="text-3xl font-bold font-heading mb-1">{stats?.today_submitted ?? 0}</div>
            )}
            <p className="text-sm text-muted-foreground">Hari Ini</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-secondary-foreground">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <Badge variant="outline" className="text-xs font-normal">Bulan Ini</Badge>
            </div>
            {isStatsLoading ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded mb-1" />
            ) : (
              <div className="text-3xl font-bold font-heading mb-1">{stats?.this_month_submitted ?? 0}</div>
            )}
            <p className="text-sm text-muted-foreground">Bulan Ini</p>
          </CardContent>
        </Card>
      </div>

      {/* Misi Harian — section terpisah */}
      {!isStatsLoading && stats && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            {stats.mission_completed && (
              <div className="mb-4">
                <Badge variant="success" className="bg-success/20 text-success border-success/30 text-sm px-3 py-1">
                  🎯 Misi Tercapai!
                </Badge>
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">
                Misi Harian: <span className="font-bold text-foreground">{stats.today_submitted}</span> dari{' '}
                <span className="font-bold text-foreground">{stats.daily_target}</span> artikel
              </p>
              <span className="text-sm font-semibold text-primary">{stats.daily_progress_pct}%</span>
            </div>
            <Progress value={stats.daily_progress_pct} className="h-3" />
          </CardContent>
        </Card>
      )}
      {isStatsLoading && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6 space-y-3">
            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
            <div className="h-3 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      )}

      {/* Drafts List */}
      {/* flex-1 min-h-0: daftar menyusut mengikuti layar, halaman tidak memanjang */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        <h2 className="text-xl font-bold font-heading">Daftar Artikel</h2>
        
        {isDraftsLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <Card key={i} className="animate-pulse bg-card/30">
                <CardContent className="p-6 h-24" />
              </Card>
            ))}
          </div>
        ) : draftsList?.data && draftsList.data.length > 0 ? (
          <div className="space-y-3">
            {draftsList.data.map((draft, i) => (
              <Link key={draft.id} href={`/drafts/${draft.id}`}>
                <Card className="cursor-pointer hover:bg-muted/30 transition-colors border-border/40 group overflow-hidden relative">
                  {/* Subtle color accent based on score */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                    draft.relevance_score >= 75 ? 'bg-success' : 
                    draft.relevance_score >= 50 ? 'bg-warning' : 'bg-destructive'
                  } opacity-50`} />
                  
                  <CardContent className="p-5 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusBadge(draft.status)}
                        <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider bg-muted px-2 py-0.5 rounded-full">
                          {draft.source_type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(draft.created_at), 'd MMM yyyy', { locale: id })}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold truncate group-hover:text-primary transition-colors">
                        {draft.title}
                      </h3>
                      {draft.rejection_reason && draft.status === 'rejected' && (
                        <p className="text-sm text-destructive mt-1 line-clamp-1">
                          Alasan: {draft.rejection_reason}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex flex-col items-end shrink-0 text-right">
                      <div className="text-xs text-muted-foreground mb-1">Skor Relevansi</div>
                      <div className={`text-2xl font-heading ${getScoreColor(draft.relevance_score)} flex items-center gap-3`}>
                        {draft.relevance_score}
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="bg-card/30 border-dashed border-border p-12 text-center">
            <CardContent className="p-0">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Belum ada draft</h3>
              <p className="text-muted-foreground mb-6">Mulai kontribusi dengan memasukkan pengetahuan baru.</p>
              <Button onClick={() => setLocation('/input')}>Input Pengetahuan</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
