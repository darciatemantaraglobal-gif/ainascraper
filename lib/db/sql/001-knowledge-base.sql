-- Tabel knowledge_base TIDAK dikelola drizzle-kit (lihat src/schema/managed.ts).
-- Jalankan file ini SEKALI di Supabase SQL Editor kalau tabelnya belum ada.
-- Kalau aplikasi AINA yang lain sudah membuatnya, LEWATI file ini.

CREATE TABLE IF NOT EXISTS knowledge_base (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  content      text NOT NULL,
  source       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending from scraper',
  created_at   timestamptz NOT NULL DEFAULT now(),
  chunk_index  integer NOT NULL DEFAULT 0,
  embedding    text
);

CREATE INDEX IF NOT EXISTS knowledge_base_created_at_idx
  ON knowledge_base (created_at DESC);
