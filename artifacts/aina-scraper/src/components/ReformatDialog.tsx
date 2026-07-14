import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import {
  Sparkles, List, AlignLeft, MessageCircleQuestion, Wand2, AlertTriangle, Check,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/Markdown';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface ReformatResult {
  title: string;
  content: string;
  summary: string;
  keywords: string;
  important_notes: string;
  category: string;
  style_used: 'points' | 'narrative' | 'faq';
  style_examples: string[];
  ai_used: boolean;
}

const STYLES = [
  { key: 'auto',      label: 'Otomatis',  icon: Wand2,                  desc: 'AI pilih yang paling pas' },
  { key: 'points',    label: 'Poin',      icon: List,                   desc: 'Ringkas, bullet' },
  { key: 'narrative', label: 'Naratif',   icon: AlignLeft,              desc: 'Paragraf berita' },
  { key: 'faq',       label: 'Tanya-Jawab', icon: MessageCircleQuestion, desc: 'Format FAQ' },
] as const;

/**
 * Dialog "Rapikan dengan AI".
 *
 * SENGAJA TIDAK langsung menimpa draft. Hasil AI ditampilkan dulu sebagai
 * PRATINJAU, dan kontributor harus menekan "Terapkan". Alasannya: AI bisa
 * membuang detail konkret (biaya, alamat, syarat dokumen) yang justru paling
 * dicari mahasiswa. Manusia harus memeriksanya dulu.
 */
export function ReformatDialog({
  draftId,
  open,
  onOpenChange,
  onApply,
}: {
  draftId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApply: (r: ReformatResult) => void;
}) {
  const [style, setStyle] = useState<string>('auto');
  const [result, setResult] = useState<ReformatResult | null>(null);

  const run = useMutation({
    mutationFn: (s: string) =>
      customFetch<ReformatResult>(`/api/drafts/${draftId}/reformat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: s }),
        timeoutMs: 120_000, // AI + few-shot bisa lama untuk artikel panjang
      }),
    onSuccess: (r) => {
      setResult(r);
      if (!r.ai_used) {
        toast.warning(
          'AI tidak tersedia — teks hanya dibersihkan dari sampah scraping, tidak ditulis ulang.',
          { duration: 7000 },
        );
      }
    },
    onError: (e) => toast.error((e as Error).message || 'Gagal merapikan artikel.'),
  });

  const close = (o: boolean) => {
    if (!o) setResult(null);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Rapikan dengan AI
          </DialogTitle>
          <DialogDescription>
            AI akan membuang sampah scraping dan menulis ulang mengikuti gaya
            artikel asli di Knowledge Base AINA.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStyle(s.key)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors',
                    style === s.key
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  <s.icon className={cn('w-4 h-4 mb-1.5', style === s.key ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">{s.desc}</div>
                </button>
              ))}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => close(false)}>Batal</Button>
              <Button disabled={run.isPending} onClick={() => run.mutate(style)}>
                {run.isPending ? (
                  <>
                    <span className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Merapikan…
                  </>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Rapikan</>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="outline" className="border-primary/30 text-primary">
                {STYLES.find((s) => s.key === result.style_used)?.label ?? result.style_used}
              </Badge>
              <Badge variant="secondary">{result.category}</Badge>
              {result.ai_used ? (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-500">
                  <Check className="w-3 h-3 mr-1" /> Ditulis ulang AI
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500/30 text-amber-500">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Hanya dibersihkan (AI gagal)
                </Badge>
              )}
            </div>

            {/* Transparansi: tunjukkan artikel mana yang jadi acuan gaya */}
            {result.style_examples.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Meniru gaya artikel KB: <i>{result.style_examples.join(' · ')}</i>
              </p>
            )}

            <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border bg-muted/20 p-4">
              <h3 className="text-base font-bold mb-1">{result.title}</h3>
              {result.summary && (
                <p className="text-xs text-muted-foreground italic mb-3">{result.summary}</p>
              )}
              <Markdown>{result.content}</Markdown>

              {result.important_notes && (
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xs font-semibold text-amber-500 mb-1">Catatan Penting</p>
                  <p className="text-xs text-muted-foreground">{result.important_notes}</p>
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
              Periksa dulu: pastikan biaya, alamat, tanggal, dan syarat dokumen tidak
              ada yang hilang atau berubah. AI bisa keliru.
            </p>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setResult(null)}>Ulangi</Button>
              <Button
                onClick={() => {
                  onApply(result);
                  toast.success('Hasil diterapkan. Jangan lupa Simpan.');
                  close(false);
                }}
              >
                <Check className="w-4 h-4 mr-2" /> Terapkan ke Draft
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
