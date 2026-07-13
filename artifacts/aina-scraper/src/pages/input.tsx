import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  useScrapeUrl, 
  useScrapeManual, 
  useScrapePdf, 
  useScrapeInstagram 
} from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { 
  Globe, 
  FileText, 
  FileBox, 
  Instagram, 
  Wand2, 
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { DuplicateWarning, type DuplicateReport } from '@/components/DuplicateWarning';

const urlSchema = z.object({ url: z.string().url('URL tidak valid') });
const manualSchema = z.object({ 
  title: z.string().min(1, 'Judul wajib diisi'),
  text: z.string().min(10, 'Teks minimal 10 karakter')
});
/**
 * Validasi di sisi klien: pastikan ini link POSTINGAN, bukan link profil.
 * Dicek di sini supaya kontributor langsung dapat pesan yang jelas, tanpa
 * menunggu server dan tanpa membakar kuota Apify.
 *
 * Menerima: /p/, /reel/, /reels/, /tv/ — dengan atau tanpa www, https,
 * dan dengan parameter ?igsh= dari tombol Share Instagram.
 */
const instagramSchema = z.object({
  url: z
    .string()
    .min(1, 'Link Instagram wajib diisi')
    .refine((v) => /instagram\.com/i.test(v), {
      message: 'Harus link Instagram. Untuk artikel web biasa, pakai tab URL.',
    })
    .refine((v) => /instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/i.test(v), {
      message:
        'Ini bukan link postingan. Buka postingannya, klik Share (✈) → Copy link.',
    }),
});

export default function InputPage() {
  const [_, setLocation] = useLocation();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [instaError, setInstaError] = useState<{ is503: boolean; message: string } | null>(null);
  
  const scrapeUrlMutation = useScrapeUrl();
  const scrapeManualMutation = useScrapeManual();
  const scrapePdfMutation = useScrapePdf();
  const scrapeInstaMutation = useScrapeInstagram();

  const urlForm = useForm({ resolver: zodResolver(urlSchema), defaultValues: { url: '' } });
  const manualForm = useForm({ resolver: zodResolver(manualSchema), defaultValues: { title: '', text: '' } });
  const instaForm = useForm({ resolver: zodResolver(instagramSchema), defaultValues: { url: '' } });

  const [result, setResult] = useState<{
    id: string;
    title: string;
    score: number;
    duplicate?: DuplicateReport | null;
  } | null>(null);

  const onSuccess = (data: any) => {
    // Server mengirim ai_used=false kalau OpenRouter gagal dan sistem terpaksa
    // memakai heuristik kata kunci. Dulu ini disembunyikan, dan user mengira
    // skor relevansi itu hasil AI padahal bukan.
    if (data?.ai_used === false) {
      toast.warning(
        'Analisis AI tidak tersedia — skor & ringkasan memakai heuristik kata kunci. Periksa OPENROUTER_API_KEY.',
        { duration: 8000 },
      );
    } else {
      toast.success('Berhasil dianalisis AI');
    }
    // Peringatan duplikat: kalau topik ini sudah ada di Knowledge Base,
    // kontributor lebih baik cari topik lain sekarang, bukan setelah ditolak admin.
    const dup: DuplicateReport | undefined = data?.duplicate;
    if (dup?.isDuplicate) {
      toast.warning('Informasi ini sepertinya sudah ada di Knowledge Base.', { duration: 8000 });
    }

    setResult({
      id: data.id,
      title: data.title,
      score: data.relevance_score,
      duplicate: dup ?? null,
    });
  };

  const onError = (error: any) => {
    toast.error(error.message || 'Gagal memproses data');
  };

  const onUrlSubmit = (values: z.infer<typeof urlSchema>) => {
    scrapeUrlMutation.mutate({ data: { url: values.url } }, { onSuccess, onError });
  };

  const onManualSubmit = (values: z.infer<typeof manualSchema>) => {
    scrapeManualMutation.mutate({ data: { title: values.title, text: values.text } }, { onSuccess, onError });
  };

  const onInstaSubmit = (values: z.infer<typeof instagramSchema>) => {
    setInstaError(null);
    scrapeInstaMutation.mutate(
      { data: { url: values.url } },
      {
        onSuccess: (data) => {
          setInstaError(null);
          onSuccess(data);
        },
        onError: (error: any) => {
          const message = error?.message || 'Gagal memproses data';
          const is503 = message.includes('belum dikonfigurasi') || message.includes('APIFY_API_TOKEN');
          setInstaError({ is503, message });
        },
      }
    );
  };

  const [isReadingPdf, setIsReadingPdf] = useState(false);

  /**
   * Batas aman ukuran PDF.
   * Server menerima body maksimal 15 MB, dan base64 MEMBENGKAKKAN ukuran ~33%.
   * Jadi file 11 MB sudah jadi ~15 MB saat dikirim -> ditolak 413.
   * Kita cegah di sini dengan pesan yang jelas, bukan error misterius.
   */
  const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

  const handlePdfUpload = async () => {
    if (!pdfFile) return;

    // Validasi 1: benar-benar PDF? (atribut accept bisa diakali)
    const isPdf =
      pdfFile.type === 'application/pdf' || /\.pdf$/i.test(pdfFile.name);
    if (!isPdf) {
      toast.error('File harus berformat PDF.');
      return;
    }

    // Validasi 2: ukuran
    if (pdfFile.size > MAX_PDF_BYTES) {
      const mb = (pdfFile.size / 1024 / 1024).toFixed(1);
      toast.error(`Ukuran PDF ${mb} MB melebihi batas 10 MB. Pecah dokumennya dulu.`);
      return;
    }

    if (pdfFile.size === 0) {
      toast.error('File PDF kosong.');
      return;
    }

    setIsReadingPdf(true);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          const b64 = reader.result?.toString().split(',')[1];
          // BUG LAMA: kalau ini kosong, kode diam saja — tombol tidak bereaksi
          // sama sekali dan user tidak tahu apa yang terjadi.
          if (!b64) return reject(new Error('Gagal membaca isi PDF.'));
          resolve(b64);
        };

        // BUG LAMA: onerror tidak pernah dipasang. File rusak / tidak terbaca
        // = tidak ada apa pun yang terjadi, selamanya.
        reader.onerror = () => reject(new Error('File tidak bisa dibaca. Coba file lain.'));
        reader.onabort = () => reject(new Error('Pembacaan file dibatalkan.'));

        reader.readAsDataURL(pdfFile);
      });

      scrapePdfMutation.mutate(
        { data: { filename: pdfFile.name, content_base64: base64 } },
        { onSuccess, onError },
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsReadingPdf(false);
    }
  };

  const isAnyLoading =
    scrapeUrlMutation.isPending ||
    scrapeManualMutation.isPending ||
    scrapePdfMutation.isPending ||
    scrapeInstaMutation.isPending ||
    isReadingPdf; // membaca file besar butuh waktu — tombol harus ikut disabled

  const renderResult = () => {
    if (!result) return null;

    const getScoreDetails = (score: number) => {
      if (score >= 75) return { color: 'success', icon: CheckCircle2, text: 'Sangat Relevan' };
      if (score >= 50) return { color: 'warning', icon: AlertTriangle, text: 'Cukup Relevan' };
      return { color: 'destructive', icon: AlertCircle, text: 'Tidak Relevan' };
    };

    const details = getScoreDetails(result.score);
    const Icon = details.icon;

    return (
      <Card className="mt-8 border-primary/20 bg-primary/5 animate-in slide-in-from-bottom-4 fade-in duration-300">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={details.color as any} className="flex items-center gap-1">
                  <Icon className="w-3 h-3" />
                  Skor: {result.score} ({details.text})
                </Badge>
              </div>
              <h3 className="font-heading font-semibold text-lg">{result.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Draft telah dibuat dan siap untuk direview atau diajukan.
              </p>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <Button variant="outline" className="w-full md:w-auto" onClick={() => {
                setResult(null);
                urlForm.reset();
                manualForm.reset();
                instaForm.reset();
                setPdfFile(null);
              }}>
                Input Baru
              </Button>
              <div className="mb-4">
                <DuplicateWarning report={result.duplicate} />
              </div>

              <Button className="w-full md:w-auto" onClick={() => setLocation(`/drafts/${result.id}`)}>
                Lihat & Edit Draft
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-heading mb-2">Input Pengetahuan</h1>
        <p className="text-muted-foreground">Pilih metode input untuk memasukkan artikel ke dalam draft.</p>
      </div>

      <Tabs defaultValue="url" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-12 mb-8 bg-card border border-border">
          <TabsTrigger value="url" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
            <Globe className="w-4 h-4 hidden sm:block" /> URL
          </TabsTrigger>
          <TabsTrigger value="manual" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
            <FileText className="w-4 h-4 hidden sm:block" /> Manual
          </TabsTrigger>
          <TabsTrigger value="pdf" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
            <FileBox className="w-4 h-4 hidden sm:block" /> PDF
          </TabsTrigger>
          <TabsTrigger value="instagram" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
            <Instagram className="w-4 h-4 hidden sm:block" /> Instagram
          </TabsTrigger>
        </TabsList>

        <div className="relative">
          {/* URL Tab */}
          <TabsContent value="url" className="mt-0">
            <Card>
              <CardContent className="pt-6">
                <form onSubmit={urlForm.handleSubmit(onUrlSubmit)} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">URL Artikel / Sumber</label>
                    <Input 
                      placeholder="https://example.com/article" 
                      {...urlForm.register('url')} 
                      className={urlForm.formState.errors.url ? 'border-destructive' : ''}
                    />
                    {urlForm.formState.errors.url && (
                      <p className="text-destructive text-sm mt-1">{urlForm.formState.errors.url.message as string}</p>
                    )}
                  </div>
                  <Button type="submit" disabled={isAnyLoading} className="w-full h-12 text-base">
                    {scrapeUrlMutation.isPending ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <><Wand2 className="w-4 h-4 mr-2" /> Scrape & Analisis</>}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manual Tab */}
          <TabsContent value="manual" className="mt-0">
            <Card>
              <CardContent className="pt-6">
                <form onSubmit={manualForm.handleSubmit(onManualSubmit)} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Judul Konten</label>
                    <Input 
                      placeholder="Masukkan judul..." 
                      {...manualForm.register('title')}
                      className={manualForm.formState.errors.title ? 'border-destructive' : ''}
                    />
                    {manualForm.formState.errors.title && (
                      <p className="text-destructive text-sm mt-1">{manualForm.formState.errors.title.message as string}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Teks / Konten Utama</label>
                    <Textarea 
                      placeholder="Paste teks konten di sini..." 
                      className={`min-h-[200px] resize-y ${manualForm.formState.errors.text ? 'border-destructive' : ''}`}
                      {...manualForm.register('text')}
                    />
                    {manualForm.formState.errors.text && (
                      <p className="text-destructive text-sm mt-1">{manualForm.formState.errors.text.message as string}</p>
                    )}
                  </div>
                  <Button type="submit" disabled={isAnyLoading} className="w-full h-12 text-base">
                    {scrapeManualMutation.isPending ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <><Wand2 className="w-4 h-4 mr-2" /> Analisis Teks</>}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PDF Tab */}
          <TabsContent value="pdf" className="mt-0">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div 
                    className="border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => document.getElementById('pdf-upload')?.click()}
                  >
                    <input 
                      id="pdf-upload" 
                      type="file" 
                      accept=".pdf" 
                      className="hidden" 
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    />
                    <UploadCloud className="w-12 h-12 text-muted-foreground mb-4" />
                    {pdfFile ? (
                      <div>
                        <p className="font-medium text-primary">{pdfFile.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    ) : (
                      <>
                        <p className="font-medium">Klik untuk memilih file PDF</p>
                        <p className="text-sm text-muted-foreground mt-1">Maksimal ukuran file 10MB</p>
                      </>
                    )}
                  </div>
                  <Button 
                    onClick={handlePdfUpload} 
                    disabled={!pdfFile || isAnyLoading} 
                    className="w-full h-12 text-base"
                  >
                    {scrapePdfMutation.isPending ? <><div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />Mengekstrak &amp; menganalisis PDF...</> : <><Wand2 className="w-4 h-4 mr-2" /> Ekstrak &amp; Analisis PDF</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Instagram Tab */}
          <TabsContent value="instagram" className="mt-0">
            <Card>
              <CardContent className="pt-6">
                <form onSubmit={instaForm.handleSubmit(onInstaSubmit)} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Link Postingan / Reel Instagram</label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Buka postingannya di Instagram → tombol <b>Share (✈)</b> → <b>Copy link</b>.
                      Cukup link postingannya saja, tidak perlu username.
                      Semua slide carousel akan dibaca otomatis.
                    </p>
                    <Input 
                      placeholder="https://www.instagram.com/p/..." 
                      {...instaForm.register('url')}
                      className={instaForm.formState.errors.url ? 'border-destructive' : ''}
                      onChange={() => setInstaError(null)}
                    />
                    {instaForm.formState.errors.url && (
                      <p className="text-destructive text-sm mt-1">{instaForm.formState.errors.url.message as string}</p>
                    )}
                  </div>

                  {instaError && (
                    instaError.is503 ? (
                      <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-warning">Fitur belum dikonfigurasi</p>
                          <p className="text-xs text-muted-foreground mt-1">{instaError.message}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                        <p className="text-sm text-destructive">{instaError.message}</p>
                      </div>
                    )
                  )}

                  <Button type="submit" disabled={isAnyLoading} className="w-full h-12 text-base">
                    {scrapeInstaMutation.isPending
                      ? <><div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />Mengambil post &amp; menjalankan OCR...</>
                      : <><Wand2 className="w-4 h-4 mr-2" /> Scrape &amp; Analisis</>}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      {renderResult()}
    </div>
  );
}
