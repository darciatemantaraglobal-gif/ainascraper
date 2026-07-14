import { useEffect, useState } from 'react';

const KEY = 'aina.sidebar.collapsed';

/** Status buka/tutup sidebar, diingat antar kunjungan. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, collapsed ? '1' : '0');
    } catch {
      /* private mode */
    }
  }, [collapsed]);

  return [collapsed, setCollapsed] as const;
}

/** true kalau layar selebar ponsel (< 768px). Ikut berubah saat layar diputar. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
