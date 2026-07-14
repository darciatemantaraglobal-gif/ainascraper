import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Copy, Trash2, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { PageShell } from '@/components/PageShell';
import { Pager } from '@/components/Pager';

interface KbRef {
  id: string;
  title: string;
  category: string;
  created_at: string;
}
interface Pair {
  similarity: number;
  a: KbRef;
  b: KbRef;
}
interface DupResponse {
  threshold: number;
  strong_threshold: number;
  pairs: Pair[];
}

const PAGE_SIZE = 4;

export default function AdminDuplicatesPage() {
  const qc = useQueryClient();
  const [threshold, setThreshold] = useState(0.9);
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<KbRef | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['kb-duplicates', threshold],
    queryFn: () => customFetch<DupResponse>(`/api/knowledge-base/duplicates?threshold=${threshold}`),
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      customFetch(`/api/knowledge-base/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Artikel duplikat dihapus.');
      setToDelete(null);
      void qc.invalidateQueries({ queryKey: ['kb-duplicates'] });
    },
    onError: (e) => toast.error((e as Error).message || 'Gagal menghapus artikel.'),
  });

  const pairs = data?.pairs ?? [];
  const shown = pairs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const older = (p: Pair) =>
    new Date(p.a.created_at) <= new Date(p.b.created_at) ? p.a : p.b;

  return (
    <PageShell
      title="Duplikat Knowledge Base"
      description="Artikel yang isinya nyaris sama. Hapus salah satu agar AINA tidak bingung."
      actions={
        <div className="flex items-center gap-3 w-64">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
          <Slider
            value={[threshold * 100]}
            min={70}
            max={99}
            step={1}
            onValueChange={([v]) => { setThreshold((v ?? 90) / 100); setPage(1); }}
          />
          <span className="text-xs tabular-nums w-10 text-right">{Math.round(threshold * 100)}%</span>
        </div>
      }
      footer={<Pager page={page} total={pairs.length} limit={PAGE_SIZE} onPage={setPage} label="pasangan" />}
    >
      {/* Kenapa slider: ambang yang pas beda-beda tiap knowledge base.
          Geser ke kiri = lebih banyak kandidat (termasuk yang cuma mirip),
          ke kanan = hanya yang hampir identik. */}
      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-card/40 animate-pulse" />
          ))
        ) : pairs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center border border-dashed border-border rounded-xl">
            <ShieldCheck className="w-8 h-8 text-success/60 mb-2" />
            <p className="text-sm font-medium">Tidak ada duplikat</p>
            <p className="text-xs text-muted-foreground">
              Tidak ada pasangan artikel dengan kemiripan ≥ {Math.round(threshold * 100)}%.
            </p>
          </div>
        ) : (
          shown.map((p) => {
            const suggested = older(p); // yang lebih tua biasanya yang asli -> hapus yang baru
            const other = suggested.id === p.a.id ? p.b : p.a;

            return (
              <Card key={`${p.a.id}-${p.b.id}`} className="border-border/50 bg-card/80">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Copy className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-500 tabular-nums">
                      {Math.round(p.similarity * 100)}% mirip
                    </span>
                    {p.similarity >= (data?.strong_threshold ?? 0.92) && (
                      <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                        hampir identik
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[suggested, other].map((art, i) => (
                      <div
                        key={art.id}
                        className={`rounded-lg border p-3 ${
                          i === 0 ? 'border-border bg-muted/20' : 'border-primary/30 bg-primary/5'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Badge variant="secondary" className="text-[10px]">{art.category}</Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(art.created_at), 'd MMM yyyy', { locale: localeId })}
                          </span>
                          {i === 0 && (
                            <Badge variant="outline" className="text-[10px] border-success/40 text-success">
                              lebih lama · simpan
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm font-medium leading-snug mb-2">{art.title}</p>

                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={() => setToDelete(art)}
                        >
                          <Trash2 className="w-3 h-3 mr-1" /> Hapus ini
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus artikel dari Knowledge Base?</AlertDialogTitle>
            <AlertDialogDescription>
              <b className="text-foreground">{toDelete?.title}</b>
              <br />
              Artikel ini akan dihapus permanen dari knowledge_base dan tidak lagi
              dibaca AINA. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={del.isPending}
              onClick={() => toDelete && del.mutate(toDelete.id)}
            >
              Hapus permanen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
