import { useState } from 'react';
import { useListKnowledgeBase } from '@workspace/api-client-react';
import { Database, Search, Sparkles, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PageShell } from '@/components/PageShell';
import { Pager } from '@/components/Pager';
import { Markdown, stripMarkdown } from '@/components/Markdown';

const PAGE_SIZE = 8;

export default function KnowledgeBasePage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<{ title: string; content: string } | null>(null);

  const { data: kbList, isLoading } = useListKnowledgeBase({ page, limit: PAGE_SIZE });

  const all = kbList?.data ?? [];
  // Pencarian menyaring halaman yang sedang tampil (server belum punya endpoint cari).
  const items = q.trim()
    ? all.filter((a) => a.title.toLowerCase().includes(q.toLowerCase()))
    : all;

  return (
    <PageShell
      title="Knowledge Base"
      description="Arsip pengetahuan yang dibaca AI AINA."
      actions={
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Artikel</div>
          <div className="text-2xl font-bold tabular-nums">{kbList?.total ?? 0}</div>
        </div>
      }
      footer={<Pager page={page} total={kbList?.total ?? 0} limit={PAGE_SIZE} onPage={setPage} label="artikel" />}
    >
      <div className="shrink-0 relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari judul di halaman ini…"
          className="pl-10 h-10 bg-card/50"
        />
      </div>

      <div className="flex-1 min-h-0 space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-card/40 animate-pulse" />
          ))
        ) : items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center border border-dashed border-border rounded-xl">
            <Database className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium">Belum ada artikel</p>
            <p className="text-xs text-muted-foreground">Setujui draft untuk mengisi knowledge base.</p>
          </div>
        ) : (
          items.map((a) => (
            <Card
              key={a.id}
              className="border-border/50 bg-card/80 cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => setOpen({ title: a.title, content: a.content })}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {stripMarkdown(a.content, 100)}
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{a.category}</Badge>
                  {a.has_embedding ? (
                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500">
                      <Sparkles className="w-3 h-3 mr-1" /> Embed
                    </Badge>
                  ) : (
                    /* Tanpa embedding, artikel TIDAK muncul di pencarian AINA. */
                    <Badge
                      variant="outline"
                      className="text-[10px] border-amber-500/30 text-amber-500"
                      title="Belum di-embed — belum bisa ditemukan AINA"
                    >
                      <AlertTriangle className="w-3 h-3 mr-1" /> Belum embed
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Klik artikel -> lihat isi lengkapnya, dirender sebagai Markdown */}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{open?.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto pr-2">
            {open && <Markdown>{open.content}</Markdown>}
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
