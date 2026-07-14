import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * Render Markdown menjadi HTML yang rapi.
 *
 * MASALAH SEBELUMNYA: konten artikel sudah berformat Markdown (# Heading,
 * **tebal**, - poin), tapi ditampilkan sebagai TEKS MENTAH — user melihat
 * tanda pagar dan bintang, bukan judul dan huruf tebal.
 *
 * react-markdown TIDAK merender HTML mentah secara default, jadi konten hasil
 * scrape dari web tidak bisa menyuntikkan skrip (aman dari XSS).
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-invert max-w-none',
        // Ukuran & jarak yang enak dibaca di tema gelap
        'prose-headings:font-heading prose-headings:tracking-tight prose-headings:text-foreground',
        'prose-h1:text-2xl prose-h1:mb-3 prose-h1:mt-0',
        'prose-h2:text-xl prose-h2:mb-2 prose-h2:mt-6',
        'prose-h3:text-lg prose-h3:mb-2 prose-h3:mt-4',
        'prose-p:text-muted-foreground prose-p:leading-relaxed',
        'prose-strong:text-foreground prose-strong:font-semibold',
        'prose-li:text-muted-foreground prose-li:my-0.5',
        'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
        'prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none',
        'prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground',
        'prose-table:text-sm prose-th:text-foreground',
        'prose-hr:border-border',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

/**
 * Buang sintaks Markdown -> teks polos.
 * Dipakai untuk PRATINJAU di kartu daftar: kalau Markdown dirender penuh di
 * kartu, heading raksasa akan merusak tata letak.
 */
export function stripMarkdown(md: string, maxLen = 160): string {
  const plain = md
    .replace(/^#{1,6}\s+/gm, '')       // heading
    .replace(/\*\*(.*?)\*\*/g, '$1')   // tebal
    .replace(/\*(.*?)\*/g, '$1')       // miring
    .replace(/`([^`]*)`/g, '$1')       // kode
    .replace(/!?\[(.*?)\]\(.*?\)/g, '$1') // tautan/gambar
    .replace(/^[-*+]\s+/gm, '')        // poin
    .replace(/^>\s?/gm, '')            // kutipan
    .replace(/\n{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return plain.length > maxLen ? plain.slice(0, maxLen).trimEnd() + '…' : plain;
}
