import { AlertTriangle, CheckCircle2, ExternalLink, Link2, Type, Brain, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export interface DuplicateHit {
  kind: 'url' | 'title' | 'semantic';
  id: string;
  title: string;
  where: 'knowledge_base' | 'draft';
  similarity: number;
  status?: string;
  submittedBy?: string;
}

export interface DuplicateReport {
  isDuplicate: boolean;
  needsReview: boolean;
  hits: DuplicateHit[];
  /**
   * true = ada lapis pengecekan yang gagal, jadi hasilnya TIDAK LENGKAP.
   * Jangan tampilkan hijau "aman" — itu bohong. Tampilkan abu-abu "tidak bisa dicek".
   */
  degraded?: boolean;
  failedLayers?: DuplicateHit['kind'][];
}

const KIND_LABEL: Record<DuplicateHit['kind'], { text: string; icon: typeof Link2 }> = {
  url:      { text: 'Link sama persis',  icon: Link2 },
  title:    { text: 'Judul mirip',        icon: Type },
  semantic: { text: 'Isi mirip',          icon: Brain },
};

/**
 * Peringatan duplikat untuk kontributor.
 *
 * Tujuannya BUKAN memblokir, tapi menghemat waktu: kalau informasi ini sudah
 * ada di knowledge base, lebih baik kontributor cari topik lain daripada
 * mengerjakan sesuatu yang akhirnya ditolak admin.
 */
export function DuplicateWarning({ report }: { report?: DuplicateReport | null }) {
  // Cek duplikat gagal/tidak lengkap. HIJAU = BOHONG di sini: kita tidak tahu
  // apakah topik ini sudah ada atau belum. Katakan apa adanya.
  if (report?.degraded && report.hits.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <HelpCircle className="w-4 h-4" />
        Cek duplikat sedang tidak tersedia — draft tetap tersimpan, tapi belum dipastikan unik.
      </div>
    );
  }

  if (!report || report.hits.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-success">
        <CheckCircle2 className="w-4 h-4" />
        Topik ini belum ada di Knowledge Base — aman dilanjutkan.
      </div>
    );
  }

  const strong = report.isDuplicate;

  return (
    <Card className={strong
      ? 'border-destructive/40 bg-destructive/5'
      : 'border-amber-500/40 bg-amber-500/5'}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${strong ? 'text-destructive' : 'text-amber-500'}`} />
          <div>
            <p className={`text-sm font-semibold ${strong ? 'text-destructive' : 'text-amber-500'}`}>
              {strong
                ? 'Informasi ini sepertinya SUDAH ADA di Knowledge Base'
                : 'Ada informasi serupa di Knowledge Base'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {strong
                ? 'Kalau memang sama, cari topik lain agar tidak dobel. Admin kemungkinan besar akan menolak draft ini.'
                : 'Cek dulu — kalau isinya berbeda, silakan lanjutkan.'}
            </p>
          </div>
        </div>

        <div className="space-y-1.5 pl-7">
          {report.hits.map((h) => {
            const K = KIND_LABEL[h.kind];
            return (
              <div key={`${h.kind}-${h.id}`} className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                  <K.icon className="w-3 h-3 mr-1" />
                  {K.text}
                </Badge>

                <span className="truncate flex-1 text-foreground">{h.title}</span>

                {h.kind !== 'url' && (
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {Math.round(h.similarity * 100)}% mirip
                  </span>
                )}

                {h.where === 'draft' ? (
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    draft {h.submittedBy ? `· ${h.submittedBy}` : ''}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    <ExternalLink className="w-3 h-3 mr-1" /> KB
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
