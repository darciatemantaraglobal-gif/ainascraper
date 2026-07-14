import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, FileText, History, Users, Database, Bot, Settings,
  LogOut, PenTool, KeyRound, Copy, PanelLeftClose, PanelLeftOpen, MoreHorizontal, X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { BottomNav, type NavItem } from './BottomNav';
import { useSidebarCollapsed, useIsMobile } from '@/hooks/use-sidebar';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!user) return <>{children}</>;

  const isAdmin = user.role === 'admin';

  const contributorNav: NavItem[] = [
    { name: 'Beranda', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Input', href: '/input', icon: PenTool },
    { name: 'Draft Saya', href: '/drafts', icon: FileText },
  ];

  const adminNav: NavItem[] = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Riwayat', href: '/admin/history', icon: History },
    { name: 'Pengguna', href: '/admin/users', icon: Users },
    { name: 'Duplikat', href: '/admin/duplicates', icon: Copy },
    { name: 'Otomatisasi', href: '/automation', icon: Bot },
  ];

  const sharedNav: NavItem[] = [
    { name: 'Knowledge Base', href: '/knowledge-base', icon: Database },
    { name: 'Pengaturan', href: '/settings', icon: Settings },
  ];

  const primaryNav = isAdmin ? adminNav : contributorNav;
  const allNav = [...primaryNav, ...sharedNav];

  /**
   * Bottom nav hanya muat ~4-5 ikon. Lebihnya masuk tombol "Lainnya".
   * Memaksa 7 ikon ke bawah membuat target sentuh terlalu kecil.
   */
  const bottomItems: NavItem[] = [
    ...primaryNav.slice(0, 3),
    sharedNav[0]!,
    { name: 'Lainnya', href: '#more', icon: MoreHorizontal },
  ];

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = location === item.href || location.startsWith(`${item.href}/`);

    const link = (
      <Link
        href={item.href}
        onClick={() => setSheetOpen(false)}
        className={cn(
          'flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200',
          collapsed && !isMobile ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
          active
            ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {(!collapsed || isMobile) && <span className="truncate">{item.name}</span>}
      </Link>
    );

    // Saat sidebar tertutup, nama menu muncul sebagai tooltip.
    if (collapsed && !isMobile) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{item.name}</TooltipContent>
        </Tooltip>
      );
    }
    return link;
  };

  const Group = ({ label, items }: { label: string; items: NavItem[] }) => (
    <div>
      {(!collapsed || isMobile) && (
        <div className="px-3 mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
      )}
      <div className="space-y-1">
        {items.map((i) => <NavLink key={i.href} item={i} />)}
      </div>
    </div>
  );

  const SidebarBody = () => (
    <>
      <div className={cn(
        'h-16 flex items-center border-b border-border shrink-0',
        collapsed && !isMobile ? 'justify-center px-0' : 'px-4 justify-between',
      )}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          {(!collapsed || isMobile) && (
            <span className="font-heading font-bold text-base tracking-tight truncate">AINA Scraper</span>
          )}
        </div>

        {isMobile ? (
          <Button variant="ghost" size="icon" onClick={() => setSheetOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        ) : !collapsed ? (
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setCollapsed(true)} title="Tutup sidebar">
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        ) : null}
      </div>

      <div className={cn('flex-1 overflow-y-auto py-5 flex flex-col gap-5', collapsed && !isMobile ? 'px-2' : 'px-3')}>
        <Group label={isAdmin ? 'Menu Admin' : 'Menu Kontributor'} items={primaryNav} />
        <Group label="Sistem" items={sharedNav} />
      </div>

      <div className={cn('border-t border-border shrink-0', collapsed && !isMobile ? 'p-2' : 'p-3')}>
        {collapsed && !isMobile ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={logout}>
                  <LogOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Keluar</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-2 py-2.5 bg-muted/50 rounded-xl mb-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user.username}</div>
                <div className="text-xs text-muted-foreground capitalize">{user.role}</div>
              </div>
            </div>
            <Link href="/change-password" onClick={() => setSheetOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground mb-1">
                <KeyRound className="w-4 h-4 mr-2" /> Ganti Password
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" /> Keluar
            </Button>
          </>
        )}
      </div>
    </>
  );

  return (
    <div className="h-screen flex w-full bg-background text-foreground overflow-hidden">
      {/* ---------- SIDEBAR (desktop) ---------- */}
      <aside
        className={cn(
          'hidden md:flex border-r border-border bg-card flex-col shrink-0',
          'transition-[width] duration-200 ease-out',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarBody />
      </aside>

      {/* Tombol buka kembali, muncul saat sidebar tertutup */}
      {collapsed && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(false)}
          title="Buka sidebar"
          className="hidden md:flex fixed left-[3.25rem] top-3 z-50 h-8 w-8 rounded-full border border-border bg-card shadow-md"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </Button>
      )}

      {/* ---------- DRAWER (mobile, dari tombol "Lainnya") ---------- */}
      {sheetOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in"
            onClick={() => setSheetOpen(false)}
          />
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 w-[78vw] max-w-xs bg-card border-r border-border flex flex-col animate-in slide-in-from-left duration-200">
            <SidebarBody />
          </aside>
        </>
      )}

      {/* ---------- KONTEN ---------- */}
      <main className="flex-1 min-w-0 overflow-hidden bg-background/50 relative flex flex-col">
        {/* Bilah atas khusus mobile — ala native app */}
        <header
          className="md:hidden shrink-0 h-14 flex items-center gap-2 px-4 border-b border-border bg-card/80 backdrop-blur-lg"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="font-heading font-bold text-sm">AINA Scraper</span>
          <span className="ml-auto text-xs text-muted-foreground capitalize">{user.role}</span>
        </header>

        <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.015]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />

        {/*
          overflow-y-auto (bukan hidden): halaman DAFTAR memakai PageShell yang
          tingginya pas h-full sehingga tidak pernah meluber (tetap tanpa scroll,
          pindah lewat paginasi). Halaman FORM PANJANG tetap bisa digulir.

          pb-20 di mobile memberi ruang untuk bottom nav agar konten terakhir
          tidak tertutup.
        */}
        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto p-4 pb-20 md:p-8 md:pb-8">
          {children}
        </div>
      </main>

      {/* ---------- BOTTOM NAV (mobile) ---------- */}
      <BottomNav items={bottomItems} onMore={() => setSheetOpen(true)} />
    </div>
  );
}
