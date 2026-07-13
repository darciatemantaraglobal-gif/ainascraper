import React, { useEffect, useState } from 'react';
import { 
  useGetCronSettings, 
  useGetCronLogs, 
  useUpdateCronSettings,
  getGetCronSettingsQueryKey,
  getGetCronLogsQueryKey
} from '@workspace/api-client-react';
import { customFetch } from '@workspace/api-client-react';
/**
 * BUG FIX: dulu memakai fetch('/api/...') MENTAH -> URL relatif ke Vercel
 * (bukan Railway) dan tanpa header Authorization. Selalu gagal di produksi,
 * errornya ditelan diam-diam. customFetch memakai VITE_API_BASE_URL + token.
 */
import { useQueryClient } from '@tanstack/react-query';
import { 
  Bot, 
  Settings2, 
  Power, 
  PowerOff,
  Plus,
  Trash2,
  Clock,
  Activity,
  Play
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function AutomationPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading: isSettingsLoading } = useGetCronSettings();
  const { data: logs, isLoading: isLogsLoading } = useGetCronLogs({ limit: 10 });
  const updateSettingsMutation = useUpdateCronSettings();

  const [localUrls, setLocalUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [runTime, setRunTime] = useState('00:00');
  const [isEnabled, setIsEnabled] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (settings) {
      setLocalUrls(settings.target_urls || []);
      setRunTime(settings.run_at || '00:00');
      setIsEnabled(settings.enabled);
    }
  }, [settings]);

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
      data: {
        enabled: isEnabled,
        target_urls: localUrls,
        run_at: runTime
      }
    }, {
      onSuccess: () => {
        toast.success('Pengaturan cron berhasil disimpan');
        queryClient.invalidateQueries({ queryKey: getGetCronSettingsQueryKey() });
      },
      onError: () => toast.error('Gagal menyimpan pengaturan')
    });
  };

  const handleRunNow = async () => {
    setIsRunning(true);
    try {
      const data = await customFetch<{ articles_scraped?: number; message?: string }>(
        '/api/cron/run',
        // Cron mengambil banyak URL sekaligus; beri waktu lebih panjang.
        { method: 'POST', timeoutMs: 300_000 },
      );
      toast.success(data.message || `Cron selesai: ${data.articles_scraped} artikel berhasil diambil`);
      queryClient.invalidateQueries({ queryKey: getGetCronLogsQueryKey() });
    } catch (err) {
      toast.error((err as Error).message || 'Cron gagal dijalankan');
    } finally {
      setIsRunning(false);
    }
  };

  const addUrl = () => {
    if (!newUrl) return;
    try {
      new URL(newUrl);
      if (!localUrls.includes(newUrl)) {
        setLocalUrls([...localUrls, newUrl]);
        setNewUrl('');
      } else {
        toast.error('URL sudah ada dalam daftar');
      }
    } catch (e) {
      toast.error('Format URL tidak valid');
    }
  };

  const removeUrl = (urlToRemove: string) => {
    setLocalUrls(localUrls.filter(url => url !== urlToRemove));
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
          <Bot className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold font-heading">Otomatisasi Cron</h1>
          <p className="text-muted-foreground">Atur jadwal scraping otomatis harian.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Settings Panel */}
        <div className="space-y-6">
          <Card className={`border-2 transition-colors ${isEnabled ? 'border-primary/50 bg-primary/5' : 'border-border/50'}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    {isEnabled ? <Power className="text-success w-5 h-5" /> : <PowerOff className="text-muted-foreground w-5 h-5" />}
                    Status Bot
                  </h3>
                  <p className="text-sm text-muted-foreground">Jalankan scraper otomatis setiap hari.</p>
                </div>
                <Switch 
                  checked={isEnabled} 
                  onCheckedChange={setIsEnabled} 
                  disabled={isSettingsLoading}
                  className="scale-125"
                />
              </div>

              {isEnabled && (
                <div className="mb-6">
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={handleRunNow}
                    disabled={isRunning}
                  >
                    {isRunning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                        Sedang menjalankan...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Jalankan Sekarang
                      </>
                    )}
                  </Button>
                </div>
              )}

              <div className="space-y-4 pt-6 border-t border-border/50">
                <div className="space-y-2">
                  <Label>Waktu Eksekusi (Waktu Server)</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      type="time" 
                      className="pl-10 text-lg font-mono font-semibold" 
                      value={runTime}
                      onChange={(e) => setRunTime(e.target.value)}
                      disabled={isSettingsLoading}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings2 className="w-5 h-5 text-primary" /> Target URL Harian
              </CardTitle>
              <CardDescription>Daftar situs yang akan di-scrape secara otomatis</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input 
                  placeholder="https://example.com/feed" 
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addUrl()}
                />
                <Button type="button" onClick={addUrl} variant="secondary">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="bg-muted/30 rounded-lg border border-border/50 p-2 min-h-[200px]">
                {localUrls.length > 0 ? (
                  <div className="space-y-2">
                    {localUrls.map((url) => (
                      <div key={url} className="flex items-center justify-between bg-card p-3 rounded border border-border/50 text-sm">
                        <span className="font-mono truncate mr-4">{url}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => removeUrl(url)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center text-sm">
                    Daftar target kosong. Tambahkan URL di atas.
                  </div>
                )}
              </div>

              <Button 
                className="w-full mt-4" 
                onClick={handleSaveSettings}
                disabled={updateSettingsMutation.isPending || isSettingsLoading}
              >
                {updateSettingsMutation.isPending ? 'Menyimpan...' : 'Simpan Pengaturan Cron'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Logs Panel */}
        <div>
          <Card className="border-border/50 h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="w-5 h-5 text-primary" /> Riwayat Eksekusi
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLogsLoading ? (
                <div className="space-y-4">
                  {[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
                </div>
              ) : logs && logs.length > 0 ? (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className="p-4 rounded-lg border border-border/50 bg-card/50 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold font-mono">
                          {format(new Date(log.ran_at), 'dd MMM yyyy, HH:mm:ss')}
                        </span>
                        {log.status === 'success' ? (
                          <Badge variant="success" className="bg-success/10 text-success">Success</Badge>
                        ) : log.status === 'partial' ? (
                          <Badge variant="warning" className="bg-warning/10 text-warning">Partial</Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-destructive/10 text-destructive">Error</Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span><strong className="text-foreground">{log.articles_scraped}</strong> artikel</span>
                      </div>
                      
                      {log.error_message && (
                        <div className="mt-2 p-2 bg-destructive/10 text-destructive rounded text-xs font-mono break-all">
                          {log.error_message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center text-muted-foreground">
                  Belum ada log eksekusi cron.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
