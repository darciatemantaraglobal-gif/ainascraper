import { customFetch } from '@workspace/api-client-react';
/**
 * BUG FIX: dulu memakai fetch('/api/...') MENTAH -> URL relatif ke Vercel
 * (bukan Railway) dan tanpa header Authorization. Selalu gagal di produksi,
 * errornya ditelan diam-diam. customFetch memakai VITE_API_BASE_URL + token.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { KeyRound } from 'lucide-react';

export default function ChangePasswordPage() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    // Validasi frontend: konfirmasi tidak cocok
    if (confirmPassword !== newPassword) {
      setServerError('Konfirmasi password tidak sama.');
      return;
    }

    setIsLoading(true);
    try {
      await customFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      toast.success('Password berhasil diubah.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      // Server mengirim pesan spesifik (password lama salah, dll) di message.
      setServerError((err as Error).message || 'Gagal mengubah password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-md mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Ganti Password</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Perbarui password akun kamu untuk keamanan lebih baik.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Ubah Kredensial</CardTitle>
              <CardDescription className="text-xs">
                Pastikan kamu ingat password baru setelah disimpan.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="old-password">Password Lama</Label>
              <Input
                id="old-password"
                type="password"
                placeholder="Masukkan password lama"
                value={oldPassword}
                onChange={(e) => {
                  setOldPassword(e.target.value);
                  setServerError(null);
                }}
                required
                autoComplete="current-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">Password Baru</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Masukkan password baru"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setServerError(null);
                }}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Konfirmasi Password Baru</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Ulangi password baru"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setServerError(null);
                }}
                required
                autoComplete="new-password"
              />
            </div>

            {/* Pesan error dari server atau validasi frontend */}
            {serverError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {serverError}
              </div>
            )}

            <Button type="submit" className="w-full mt-2" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Menyimpan...
                </span>
              ) : (
                'Simpan Perubahan'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
