import React, { useState } from 'react';
import { useListDrafts } from '@workspace/api-client-react';
import { PageShell } from '@/components/PageShell';
import { Pager } from '@/components/Pager';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { 
  CheckCircle2, 
  XCircle, 
  Search,
  Filter,
  Eye
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';

export default function AdminHistoryPage() {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch only approved and rejected drafts for history
  const [page, setPage] = useState(1);

  const { data: draftsList, isLoading } = useListDrafts({
    page,
    limit: 8,
    status: filterStatus === 'all' ? undefined : filterStatus as any,
  });

  const getStatusBadge = (status: string) => {
    if (status === 'approved') return <Badge variant="success" className="bg-success/10 text-success border-success/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>;
    if (status === 'rejected') return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  // Client-side search filtering (since API doesn't support text search directly in this generated schema)
  const filteredData = draftsList?.data?.filter(draft => 
    (draft.status === 'approved' || draft.status === 'rejected') &&
    (draft.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
     draft.submitted_by.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  return (
    <PageShell
      title="Riwayat Review"
      description="Semua artikel yang sudah diproses (disetujui atau ditolak)."
      footer={
        <Pager
          page={page}
          total={draftsList?.total ?? 0}
          limit={8}
          onPage={setPage}
          label="riwayat"
        />
      }
    >
      <Card className="shrink-0 border-border/50 mb-3">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Cari judul atau username..." 
              className="pl-9 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <SelectValue placeholder="Semua Status" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="approved">Disetujui</SelectItem>
                <SelectItem value="rejected">Ditolak</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* flex-1 min-h-0: tabel yang menyusut, bukan halaman yang memanjang */}
      <Card className="flex-1 min-h-0 border-border/50 bg-card overflow-y-auto">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-14 bg-muted/40 animate-pulse rounded" />
            ))}
          </div>
        ) : filteredData.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-[280px]">Judul Artikel</TableHead>
                <TableHead>Kontributor</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead className="text-center">Skor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Alasan Penolakan</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map(draft => (
                <TableRow key={draft.id} className="hover:bg-muted/20 align-top">
                  <TableCell className="font-medium max-w-[280px] truncate py-4" title={draft.title}>
                    {draft.title}
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {draft.submitted_by.charAt(0).toUpperCase()}
                      </span>
                      {draft.submitted_by}
                    </span>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge variant="outline" className="uppercase text-[10px] tracking-wider bg-muted/50">
                      {draft.source_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-mono font-medium py-4">
                    <span className={draft.relevance_score >= 75 ? 'text-success' : draft.relevance_score >= 50 ? 'text-warning' : 'text-destructive'}>
                      {draft.relevance_score}
                    </span>
                  </TableCell>
                  <TableCell className="py-4">{getStatusBadge(draft.status)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm py-4">
                    {format(new Date(draft.created_at), 'd MMM yyyy', { locale: id })}
                  </TableCell>
                  <TableCell className="py-4 max-w-[200px]">
                    {draft.rejection_reason ? (
                      <span className="text-sm italic text-muted-foreground line-clamp-2">
                        {draft.rejection_reason}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right py-4">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/drafts/${draft.id}`}>
                        <Eye className="w-4 h-4 mr-2" /> Detail
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-12 text-center text-muted-foreground">
            Tidak ada riwayat yang ditemukan dengan filter saat ini.
          </div>
        )}
      </Card>
    </PageShell>
  );
}
