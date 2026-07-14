import type { ReactNode } from 'react';

/**
 * Kerangka halaman TANPA SCROLL.
 *
 * Tinggi dikunci setinggi layar. Header dan footer (paginasi) tetap di tempat,
 * hanya daftar di tengah yang menyesuaikan. Kalau isinya banyak, user pindah
 * HALAMAN — bukan menggulir ke bawah tanpa ujung.
 */
export function PageShell({
  title,
  description,
  actions,
  children,
  footer,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="shrink-0 flex items-start justify-between gap-4 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </header>

      {/* min-h-0 WAJIB: tanpa ini, flex child menolak menyusut dan halaman
          jadi bisa di-scroll lagi. */}
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>

      {footer && <div className="shrink-0 pt-4">{footer}</div>}
    </div>
  );
}
