import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Kontrol paginasi: ganti halaman, bukan scroll ke bawah. */
export function Pager({
  page,
  total,
  limit,
  onPage,
  label = 'item',
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
  label?: string;
}) {
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        {total === 0 ? `Tidak ada ${label}` : `${from}–${to} dari ${total} ${label}`}
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Sebelumnya
        </Button>

        <span className="px-3 text-xs text-muted-foreground tabular-nums">
          {page} / {lastPage}
        </span>

        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => onPage(page + 1)}
        >
          Berikutnya
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
