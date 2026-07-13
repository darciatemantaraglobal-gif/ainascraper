import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Navigasi bawah ala aplikasi native (iOS/Android).
 *
 * Kenapa bukan sidebar di ponsel: sidebar memakan lebar layar yang sudah
 * sempit, dan jempol sulit menjangkau bagian ATAS layar. Aplikasi native
 * menaruh navigasi utama di BAWAH — dalam jangkauan jempol.
 *
 * - min-h-14 (56px): target sentuh nyaman (rekomendasi minimal 44px).
 * - safe-area-inset-bottom: tombol tidak tertutup home indicator iPhone.
 * - href "#more": bukan pindah halaman, tapi membuka drawer menu lengkap.
 */
export function BottomNav({
  items,
  onMore,
}: {
  items: NavItem[];
  onMore: () => void;
}) {
  const [location] = useLocation();
  const [, navigate] = useLocation();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-lg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch">
        {items.map((item) => {
          const isMore = item.href === '#more';
          const active =
            !isMore &&
            (location === item.href || location.startsWith(`${item.href}/`));

          return (
            <button
              key={item.href}
              type="button"
              onClick={() => (isMore ? onMore() : navigate(item.href))}
              className={cn(
                'relative flex-1 min-h-14 flex flex-col items-center justify-center gap-0.5',
                'transition-colors active:bg-muted/60',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 bg-primary rounded-full" />
              )}
              <item.icon className={cn('w-5 h-5 transition-transform', active && 'scale-110')} />
              <span className="text-[10px] font-medium leading-none">{item.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
