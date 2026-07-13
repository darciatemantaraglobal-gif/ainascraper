import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Tab bar bawah — pola navigasi standar aplikasi native (iOS/Android).
 *
 * Kenapa bukan sidebar yang di-slide: di layar HP, sidebar memakan lebar dan
 * butuh dua ketukan (buka menu -> pilih). Tab bar bawah bisa dijangkau jempol
 * dan cukup satu ketukan. Ini yang membuat aplikasi web terasa seperti app.
 *
 * Menu yang tidak muat di tab bar dipindah ke tombol "Lainnya" (Sheet).
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const [location] = useLocation();

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 backdrop-blur-lg"
      // Hormati safe-area iPhone (area gestur bar di bawah).
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          const isActive =
            location === item.href || location.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                // min-h 56px: target sentuh yang nyaman untuk jempol
                'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] px-1 transition-colors relative',
                isActive ? 'text-primary' : 'text-muted-foreground active:bg-muted/50',
              )}
            >
              {/* Indikator aktif di atas ikon, khas tab bar native */}
              {isActive && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
              )}
              <item.icon className={cn('w-5 h-5', isActive && 'scale-110')} />
              <span className="text-[10px] font-medium leading-none">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
