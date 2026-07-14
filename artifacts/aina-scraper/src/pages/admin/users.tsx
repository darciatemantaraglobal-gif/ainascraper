import React, { useState } from 'react';
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  getListUsersQueryKey,
} from '@workspace/api-client-react';
import { customFetch } from '@workspace/api-client-react';
/**
 * BUG FIX: dulu memakai fetch('/api/...') MENTAH -> URL relatif ke Vercel
 * (bukan Railway) dan tanpa header Authorization. Selalu gagal di produksi,
 * errornya ditelan diam-diam. customFetch memakai VITE_API_BASE_URL + token.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Users,
  UserPlus,
  Edit,
  Trash2,
  ShieldAlert,
  Target,
  KeyRound,
  Copy,
  Check,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

// ─── Schemas ────────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username minimal 3 karakter')
    .regex(/^[a-zA-Z0-9_]+$/, 'Hanya huruf, angka, dan underscore'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  role: z.enum(['admin', 'contributor']),
  daily_target: z.coerce.number().min(1).default(5),
});

const editUserSchema = z.object({
  role: z.enum(['admin', 'contributor']),
  daily_target: z.coerce.number().min(1),
});

// ─── Component ──────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useListUsers();

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createServerError, setCreateServerError] = useState<string | null>(null);

  const [editUser, setEditUser] = useState<any>(null);

  const [confirmResetUsername, setConfirmResetUsername] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<{ username: string; new_password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [confirmDeleteUsername, setConfirmDeleteUsername] = useState<string | null>(null);

  // ─── Forms ────────────────────────────────────────────────────────────────

  const createForm = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { username: '', password: '', role: 'contributor', daily_target: 5 },
  });

  const editForm = useForm<z.infer<typeof editUserSchema>>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { role: 'contributor', daily_target: 5 },
  });

  const openEditDialog = (user: any) => {
    setEditUser(user);
    editForm.reset({ role: user.role, daily_target: user.daily_target ?? 5 });
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleCreateSubmit = async (values: z.infer<typeof createUserSchema>) => {
    setCreateServerError(null);
    createMutation.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast.success('Akun berhasil dibuat');
          setCreateDialogOpen(false);
          createForm.reset();
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: async (err: any) => {
          // Cek apakah 409 (duplikat username) — tampilkan di dalam dialog
          if (err?.status === 409) {
            const data = err?.data ?? {};
            setCreateServerError(data.error ?? 'Username sudah digunakan.');
          } else {
            toast.error(err?.data?.error ?? 'Gagal membuat akun. Coba lagi.');
          }
        },
      },
    );
  };

  const handleEditSubmit = (values: z.infer<typeof editUserSchema>) => {
    if (!editUser) return;
    updateMutation.mutate(
      { username: editUser.username, data: { role: values.role, daily_target: values.daily_target } },
      {
        onSuccess: () => {
          toast.success('Peran berhasil diperbarui');
          setEditUser(null);
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: (err: any) => toast.error(err?.data?.error ?? 'Gagal memperbarui pengguna.'),
      },
    );
  };

  const handleResetPassword = async () => {
    if (!confirmResetUsername) return;
    setResetLoading(true);
    try {
      const data = await customFetch<{ username: string; new_password: string }>(
        `/api/users/${encodeURIComponent(confirmResetUsername)}/reset-password`,
        { method: 'POST' },
      );
      setConfirmResetUsername(null);
      setResetResult(data);
      setCopied(false);
    } catch (err) {
      setConfirmResetUsername(null);
      toast.error((err as Error).message || 'Gagal mereset password.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleDelete = () => {
    if (!confirmDeleteUsername) return;
    deleteMutation.mutate(
      { username: confirmDeleteUsername },
      {
        onSuccess: () => {
          toast.success('Akun berhasil dihapus');
          setConfirmDeleteUsername(null);
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? 'Gagal menghapus akun.';
          toast.error(msg);
          setConfirmDeleteUsername(null);
        },
      },
    );
  };

  const handleCopyPassword = () => {
    if (!resetResult) return;
    navigator.clipboard.writeText(resetResult.new_password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading mb-2 flex items-center gap-3">
            <Users className="w-7 h-7 text-primary" /> Manajemen Pengguna
          </h1>
          <p className="text-muted-foreground">Kelola akses admin dan kontributor AINA Scraper.</p>
        </div>
        <Button onClick={() => { setCreateServerError(null); createForm.reset(); setCreateDialogOpen(true); }}>
          <UserPlus className="w-4 h-4 mr-2" /> Tambah Anggota
        </Button>
      </div>

      {/* Tabel pengguna */}
      <Card className="border-border/50 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-center">Target Harian</TableHead>
              <TableHead className="text-center">Total Kontribusi</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell className="text-center"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                  <TableCell className="text-center"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-28 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : !users || users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  Belum ada pengguna terdaftar.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.username}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          user.role === 'admin'
                            ? 'bg-primary/20 text-primary'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold">{user.username}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.role === 'admin' ? (
                      <Badge variant="outline" className="border-primary/50 text-primary bg-primary/5">
                        <ShieldAlert className="w-3 h-3 mr-1" /> Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-secondary/50">
                        Kontributor
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center font-mono">
                    {user.role === 'contributor' ? (
                      <span className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Target className="w-3 h-3" /> {user.daily_target}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="text-center font-mono font-semibold">
                    {(user as any).total_drafts ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditDialog(user)}
                      >
                        <Edit className="w-3.5 h-3.5 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => setConfirmResetUsername(user.username)}
                      >
                        <KeyRound className="w-3.5 h-3.5 mr-1" /> Reset PW
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDeleteUsername(user.username)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Hapus
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ── Dialog: Tambah Pengguna ─────────────────────────────────────────── */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open) { setCreateServerError(null); createForm.reset(); }
          setCreateDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Anggota Baru</DialogTitle>
            <DialogDescription>Buat akun untuk kontributor atau admin baru.</DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4 py-2">
              <FormField
                control={createForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="contoh: ahmad_99"
                        {...field}
                        onChange={(e) => { field.onChange(e); setCreateServerError(null); }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password Awal</FormLabel>
                    <FormControl>
                      {/* type="text" agar admin bisa melihat dan menyalin password */}
                      <Input type="text" placeholder="Password awal untuk anggota" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={createForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Pilih role" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="contributor">Kontributor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="daily_target"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Harian</FormLabel>
                      <FormControl><Input type="number" min="1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Pesan error 409 duplikat username — tampil di dalam dialog */}
              {createServerError && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {createServerError}
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button variant="outline" type="button" onClick={() => setCreateDialogOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Menyimpan...' : 'Buat Akun'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Edit Role ──────────────────────────────────────────────── */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pengguna</DialogTitle>
            <DialogDescription>
              Mengubah peran untuk <strong>{editUser?.username}</strong>.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4 py-2">
              {/* Username read-only */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Username</label>
                <Input value={editUser?.username ?? ''} readOnly className="bg-muted/50 text-muted-foreground cursor-not-allowed" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Pilih role" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="contributor">Kontributor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="daily_target"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Harian</FormLabel>
                      <FormControl><Input type="number" min="1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="pt-2">
                <Button variant="outline" type="button" onClick={() => setEditUser(null)}>Batal</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── AlertDialog: Konfirmasi Reset Password ────────────────────────── */}
      <AlertDialog open={!!confirmResetUsername} onOpenChange={(open) => !open && setConfirmResetUsername(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password?</AlertDialogTitle>
            <AlertDialogDescription>
              Password <strong>{confirmResetUsername}</strong> akan direset dan diganti dengan password acak baru.
              Password lama tidak bisa dipakai lagi. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetLoading}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword} disabled={resetLoading}>
              {resetLoading ? 'Mereset...' : 'Ya, Reset Password'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Dialog: Tampil Password Baru (sekali saja) ────────────────────── */}
      <Dialog
        open={!!resetResult}
        onOpenChange={(open) => {
          if (!open) setResetResult(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" /> Password Baru Berhasil Dibuat
            </DialogTitle>
            <DialogDescription>
              Password baru untuk <strong>{resetResult?.username}</strong>:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-lg px-4 py-3 font-mono text-lg tracking-widest text-foreground border border-border select-all">
                {resetResult?.new_password}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={handleCopyPassword}
                title="Salin password"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-sm text-destructive font-medium flex items-center gap-1.5">
              ⚠️ Catat password ini sekarang. Tidak akan ditampilkan lagi.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={() => setResetResult(null)}>Sudah Dicatat, Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AlertDialog: Konfirmasi Hapus ─────────────────────────────────── */}
      <AlertDialog
        open={!!confirmDeleteUsername}
        onOpenChange={(open) => !open && setConfirmDeleteUsername(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Hapus Akun Pengguna?</AlertDialogTitle>
            <AlertDialogDescription>
              Yakin hapus <strong>{confirmDeleteUsername}</strong>? Akun akan dihapus permanen dan pengguna
              tidak bisa login lagi. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Menghapus...' : 'Ya, Hapus Akun'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
