import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

/**
 * Jaring pengaman. Tanpa ini, SATU error saat render = LAYAR PUTIH TOTAL,
 * tanpa pesan apa pun — user tidak tahu apa yang terjadi, dan kita tidak
 * punya petunjuk untuk memperbaiki.
 *
 * Dengan ini, error apa pun tetap menampilkan pesan yang bisa dibaca
 * beserta tombol pemulihan.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary] Halaman gagal dirender:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold">Halaman gagal dimuat</h1>
          <p className="text-sm text-muted-foreground">
            Terjadi kesalahan saat menampilkan halaman ini. Coba muat ulang, atau
            kembali ke beranda.
          </p>
          <pre className="text-xs text-left bg-muted/50 rounded-lg p-3 overflow-auto max-h-32 text-muted-foreground">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => window.location.reload()}>Muat ulang</Button>
            <Button variant="outline" onClick={() => (window.location.href = '/')}>
              Ke Beranda
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
