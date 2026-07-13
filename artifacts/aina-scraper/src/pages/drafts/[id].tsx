import React, { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  useGetDraft, 
  useUpdateDraft, 
  useSubmitDraft,
  useDeleteDraft,
  useApproveDraft,
  useRejectDraft,
  getGetDraftQueryKey
} from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Save, 
  Send, 
  Trash2, 
  ExternalLink,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription
} from '@/components/ui/form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import { ReformatDialog, type ReformatResult } from '@/components/ReformatDialog';
import { Sparkles } from 'lucide-react';
import { Markdown } from '@/components/Markdown';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const updateDraftSchema = z.object({
  title: z.string().min(1, 'Judul wajib diisi'),
  content: z.string().min(10, 'Konten minimal 10 karakter'),
  summary: z.string().optional(),
  tags: z.string().optional(),
  category: z.string().optional()
});

export default function DraftDetailPage() {
  const [reformatOpen, setReformatOpen] = useState(false);
  const [_, params] = useRoute('/drafts/:id');
  const [__, setLocation] = useLocation();
  const id = params?.id;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data: draft, isLoading, isError } = useGetDraft(id || '', {
    query: {
      enabled: !!id,
      queryKey: getGetDraftQueryKey(id || '')
    }
  });

  const updateMutation = useUpdateDraft();
  const submitMutation = useSubmitDraft();
  const deleteMutation = useDeleteDraft();
  const approveMutation = useApproveDraft();
  const rejectMutation = useRejectDraft();

  const [adminRejectOpen, setAdminRejectOpen] = useState(false);
  const [adminRejectReason, setAdminRejectReason] = useState('');

  const form = useForm<z.infer<typeof updateDraftSchema>>({
    resolver: zodResolver(updateDraftSchema),
    defaultValues: {
      title: '',
      content: '',
      summary: '',
      tags: '',
      category: ''
    }
  });

  useEffect(() => {
    if (draft) {
      form.reset({
        title: draft.title || '',
        content: draft.content || '',
        summary: draft.summary || '',
        tags: draft.tags || '',
        category: draft.category || ''
      });
    }
  }, [draft, form]);

  if (isError) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-bold mb-2">Draft tidak ditemukan</h2>
        <Button onClick={() => setLocation('/drafts')} variant="outline">Kembali ke daftar</Button>
      </div>
    );
  }

  if (isLoading || !draft) {
    return (
      <div className="p-10 max-w-4xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-32 bg-muted rounded" />
        <div className="h-10 w-3/4 bg-muted rounded" />
        <div className="h-64 bg-card rounded-xl" />
      </div>
    );
  }

  const isEditable = draft.status === 'draft' || draft.status === 'rejected';

  /**
   * Terapkan hasil rapikan AI ke FORM (belum disimpan ke server).
   * Kontributor tetap bisa mengedit lagi dan wajib menekan "Simpan".
   * Ini disengaja: hasil AI harus lewat mata manusia dulu.
   */
  const applyReformat = (r: ReformatResult) => {
    form.setValue('title', r.title, { shouldDirty: true });
    form.setValue('content', r.content, { shouldDirty: true });
    if (r.summary) form.setValue('summary', r.summary, { shouldDirty: true });
    if (r.keywords) form.setValue('tags', r.keywords, { shouldDirty: true });
    if (r.category) form.setValue('category', r.category, { shouldDirty: true });
  };

  const handleSave = (values: z.infer<typeof updateDraftSchema>) => {
    if (!id) return;
    updateMutation.mutate({ id, data: values }, {
      onSuccess: (data) => {
        toast.success('Draft berhasil disimpan');
        queryClient.setQueryData(getGetDraftQueryKey(id), data);
      },
      onError: () => {
        toast.error('Gagal menyimpan draft');
      }
    });
  };

  const handleSubmit = () => {
    if (!id) return;
    submitMutation.mutate({ id }, {
      onSuccess: (data) => {
        toast.success('Draft berhasil diajukan untuk review');
        queryClient.setQueryData(getGetDraftQueryKey(id), data);
      },
      onError: () => {
        toast.error('Gagal mengajukan draft');
      }
    });
  };

  const handleDelete = () => {
    if (!id) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast.success('Draft berhasil dihapus');
        setLocation('/drafts');
      },
      onError: () => {
        toast.error('Gagal menghapus draft');
      }
    });
  };

  const handleAdminApprove = () => {
    if (!id) return;
    approveMutation.mutate({ id }, {
      onSuccess: () => {
        toast.success('Draft disetujui dan masuk ke Knowledge Base AINA');
        setLocation('/admin');
      },
      onError: () => toast.error('Gagal menyetujui draft'),
    });
  };

  const handleAdminReject = () => {
    if (!id || !adminRejectReason.trim()) {
      toast.error('Alasan penolakan wajib diisi');
      return;
    }
    rejectMutation.mutate({ id, data: { rejection_reason: adminRejectReason } }, {
      onSuccess: () => {
        toast.success('Draft ditolak dan dikembalikan ke kontributor');
        setAdminRejectOpen(false);
        setLocation('/admin');
      },
      onError: () => toast.error('Gagal menolak draft'),
    });
  };

  const getScoreDetails = (score: number) => {
    if (score >= 75) return { color: 'success', icon: CheckCircle2, text: 'Sangat Relevan' };
    if (score >= 50) return { color: 'warning', icon: AlertTriangle, text: 'Cukup Relevan' };
    return { color: 'destructive', icon: AlertCircle, text: 'Tidak Relevan' };
  };

  const scoreDetails = getScoreDetails(draft.relevance_score);
  const ScoreIcon = scoreDetails.icon;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/drafts')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-heading">Detail Draft</h1>
            <Badge variant="outline" className="uppercase text-xs tracking-wider font-semibold bg-muted">{draft.source_type}</Badge>
            <Badge variant={draft.status === 'approved' ? 'success' : draft.status === 'rejected' ? 'destructive' : draft.status === 'submitted' ? 'warning' : 'secondary'} className="uppercase text-xs">
              {draft.status}
            </Badge>
          </div>
        </div>
        
        {isAdmin && draft.status === 'submitted' && (
          <div className="flex gap-2">
            <Button
              onClick={handleAdminApprove}
              disabled={approveMutation.isPending}
              className="bg-primary hover:bg-primary/90 h-10 px-5"
            >
              {approveMutation.isPending
                ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                : <ShieldCheck className="w-4 h-4 mr-2" />}
              Approve to AINA
            </Button>
            <Button
              variant="outline"
              onClick={() => { setAdminRejectOpen(true); setAdminRejectReason(''); }}
              disabled={rejectMutation.isPending}
              className="border-destructive/50 hover:bg-destructive/10 hover:text-destructive h-10"
            >
              <XCircle className="w-4 h-4 mr-2" /> Tolak
            </Button>
          </div>
        )}

        {isEditable && (
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hapus draft ini?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tindakan ini tidak dapat dibatalkan. Draft akan dihapus secara permanen dari sistem.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                    Hapus
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            <Button
              variant="outline"
              className="border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => setReformatOpen(true)}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Rapikan dengan AI
            </Button>

            <Button 
              variant="outline" 
              onClick={form.handleSubmit(handleSave)}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Simpan
            </Button>
            
            <Button 
              onClick={handleSubmit} 
              disabled={draft.relevance_score <= 50 || submitMutation.isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {submitMutation.isPending
                ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                : draft.relevance_score <= 50
                  ? <AlertCircle className="w-4 h-4 mr-2" />
                  : <Send className="w-4 h-4 mr-2" />}
              {draft.relevance_score <= 50 ? 'Ditolak Otomatis' : 'Ajukan Persetujuan'}
            </Button>
          </div>
        )}
      </div>

      {draft.relevance_score < 50 && isEditable && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex gap-3 text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold mb-1">Skor relevansi terlalu rendah ({draft.relevance_score})</h4>
            <p className="text-sm opacity-90">Draft dengan skor di bawah 50 tidak dapat diajukan. Silakan perbaiki konten atau buat draft baru dengan materi yang lebih relevan untuk mahasiswa AINA.</p>
          </div>
        </div>
      )}

      {draft.status === 'rejected' && draft.rejection_reason && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex gap-3 text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold mb-1">Draft ditolak</h4>
            <p className="text-sm opacity-90">Alasan: {draft.rejection_reason}</p>
            <p className="text-sm mt-2 font-medium">Anda dapat memperbaiki draft ini dan mengajukannya kembali.</p>
          </div>
        </div>
      )}

      {/*
        BUG FIX: <Form> dulu HANYA membungkus kolom kiri, sementara kartu
        "Metadata" (kategori & tags) di kolom KANAN juga memakai <FormField>.
        FormField memanggil useFormContext(), dan di luar <Form> nilainya null
        -> "Cannot destructure property 'getFieldState' of null" -> halaman mati.

        Sekarang <Form> membungkus SELURUH grid, jadi semua FormField berada di
        dalam provider yang sama.
      */}
      <Form {...form}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
            <form className="space-y-6">
              <Card className="bg-card shadow-sm border-border/50">
                <CardContent className="p-6 space-y-6">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Judul</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            disabled={!isEditable} 
                            className="text-lg font-semibold h-12" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Konten / Artikel</FormLabel>

                        {/*
                          Konten artikel berformat Markdown (# Judul, **tebal**, - poin).
                          Sebelumnya hanya ada Textarea, jadi user melihat tanda pagar dan
                          bintang mentah. Sekarang ada tab Pratinjau yang merender Markdown
                          persis seperti tampilannya nanti di AINA.
                        */}
                        <Tabs defaultValue="edit" className="w-full">
                          <TabsList className="mb-2">
                            <TabsTrigger value="edit">Edit</TabsTrigger>
                            <TabsTrigger value="preview">Pratinjau</TabsTrigger>
                          </TabsList>

                          <TabsContent value="edit" className="mt-0">
                            <FormControl>
                              <Textarea
                                {...field}
                                disabled={!isEditable}
                                className="min-h-[380px] resize-y font-mono text-sm leading-relaxed bg-muted/30"
                              />
                            </FormControl>
                          </TabsContent>

                          <TabsContent value="preview" className="mt-0">
                            <div className="min-h-[380px] max-h-[380px] overflow-y-auto rounded-lg border border-border bg-muted/20 p-5">
                              {field.value?.trim()
                                ? <Markdown>{field.value}</Markdown>
                                : <p className="text-sm text-muted-foreground">Belum ada konten.</p>}
                            </div>
                          </TabsContent>
                        </Tabs>

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="bg-card shadow-sm border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Info className="w-5 h-5 text-primary" /> Analisis AI
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="summary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ringkasan Otomatis</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            disabled={!isEditable} 
                            className="min-h-[100px]" 
                          />
                        </FormControl>
                        <FormDescription>Dihasilkan oleh AI saat proses scraping</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </form>
        </div>

        <div className="space-y-6">
          <Card className="bg-card shadow-sm border-border/50 overflow-hidden relative">
            <div className={`absolute top-0 left-0 right-0 h-1 bg-${scoreDetails.color}`} />
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Skor Relevansi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 mb-2">
                <span className={`text-6xl font-bold font-heading leading-none text-${scoreDetails.color}`}>
                  {draft.relevance_score}
                </span>
                <span className="text-muted-foreground font-medium pb-2">/ 100</span>
              </div>
              <div className={`flex items-center gap-2 mt-4 font-medium text-${scoreDetails.color}`}>
                <ScoreIcon className="w-5 h-5" />
                {scoreDetails.text}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-sm border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategori</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!isEditable} placeholder="Contoh: Fiqih, Akademik, Umum" />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags (pisahkan dengan koma)</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!isEditable} placeholder="mesir, beasiswa, panduan" />
                    </FormControl>
                  </FormItem>
                )}
              />

              {draft.source_url && (
                <div className="pt-4 border-t border-border mt-6">
                  <span className="text-xs text-muted-foreground block mb-2 font-medium">SUMBER ASLI</span>
                  <a 
                    href={draft.source_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline break-all"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span className="line-clamp-2">{draft.source_url}</span>
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      </Form>

      <ReformatDialog
        draftId={draft.id}
        open={reformatOpen}
        onOpenChange={setReformatOpen}
        onApply={applyReformat}
      />

      {/* Admin — Dialog Alasan Penolakan */}
      <AlertDialog open={adminRejectOpen} onOpenChange={setAdminRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tolak Draft</AlertDialogTitle>
            <AlertDialogDescription>
              Berikan alasan spesifik agar kontributor dapat memperbaiki artikel ini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Contoh: Skor relevansi terlalu rendah, informasi tidak valid, atau format tidak sesuai."
            className="min-h-[100px] my-2"
            value={adminRejectReason}
            onChange={e => setAdminRejectReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAdminRejectOpen(false)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAdminReject}
              disabled={!adminRejectReason.trim() || rejectMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {rejectMutation.isPending
                ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                : null}
              Konfirmasi Penolakan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
