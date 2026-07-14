# Deteksi Duplikat — cara kerja & kalibrasi

## Tiga lapis

| Lapis | Menangkap | Biaya |
|---|---|---|
| **1. URL sama persis** | Dua kontributor scrape link yang sama. Parameter tracking (`utm_`, `fbclid`, `www.`, trailing slash) dinormalisasi lebih dulu. | gratis |
| **2. Judul mirip** | Artikel di-repost dengan URL berbeda. Perbandingan token (Jaccard). Juga jadi **jaring pengaman kalau embedding mati**. | gratis |
| **3. Isi mirip (embedding)** | Artikel ditulis ulang dengan kata-kata berbeda tapi isinya sama. Cosine similarity via pgvector. Satu-satunya cara mendeteksi tabrakan dengan 312 artikel lama yang tidak punya jejak URL. | 1 panggilan embedding |

## Untuk kontributor
Setelah scrape, muncul kotak peringatan otomatis:
- **Hijau** — topik belum ada, aman lanjut.
- **Kuning** — ada yang mirip, cek dulu.
- **Merah** — hampir pasti sudah ada. Cari topik lain; admin kemungkinan besar menolak.

## Untuk admin
Menu **Duplikat** (`/admin/duplicates`). Membandingkan semua artikel KB satu sama
lain lewat pgvector, menampilkan pasangan yang mirip. Artikel yang **lebih lama**
ditandai "simpan" (biasanya itu yang asli). Bisa hapus permanen dari sini.

Slider di kanan atas mengatur ambang: geser kiri = lebih banyak kandidat,
kanan = hanya yang hampir identik.

---

## ⚠️ KALIBRASI — lakukan ini sekali

Ambang default (`0.84` / `0.92`) adalah **tebakan awal**, belum diuji pada data
kamu. Ambang yang salah berakibat:
- terlalu rendah → artikel berbeda dituduh duplikat (kontributor frustrasi)
- terlalu tinggi → duplikat asli lolos (KB kotor, AINA bingung)

Jalankan ini di **Supabase SQL Editor** untuk melihat sebaran kemiripan
**312 artikelmu yang sebenarnya**:

```sql
-- Sebaran similarity antar semua pasangan artikel
WITH pairs AS (
  SELECT 1 - (a.embedding <=> b.embedding) AS sim
  FROM knowledge_base a
  JOIN knowledge_base b ON a.id < b.id
  WHERE a.embedding IS NOT NULL AND b.embedding IS NOT NULL
)
SELECT
  width_bucket(sim, 0.5, 1.0, 10) AS rentang,
  round(0.5 + (width_bucket(sim, 0.5, 1.0, 10) - 1) * 0.05, 2) AS dari,
  round(0.5 + width_bucket(sim, 0.5, 1.0, 10) * 0.05, 2)       AS sampai,
  count(*)                                                      AS jumlah_pasangan
FROM pairs
WHERE sim >= 0.5
GROUP BY 1 ORDER BY 1;
```

Lalu lihat 20 pasangan paling mirip dan **nilai sendiri** mana yang benar-benar duplikat:

```sql
SELECT
  round((1 - (a.embedding <=> b.embedding))::numeric, 3) AS similarity,
  a.title AS artikel_a,
  b.title AS artikel_b
FROM knowledge_base a
JOIN knowledge_base b ON a.id < b.id
WHERE a.embedding IS NOT NULL AND b.embedding IS NOT NULL
ORDER BY a.embedding <=> b.embedding
LIMIT 20;
```

**Cara membacanya:** cari angka di mana pasangan berubah dari "beneran duplikat"
menjadi "cuma setopik". Angka itulah `DEDUPE_STRONG`. Turunkan ~0.08 untuk
`DEDUPE_WARN`.

Set hasilnya di Railway → Variables:
```
DEDUPE_WARN=0.xx
DEDUPE_STRONG=0.xx
```

## Catatan
- Deteksi semantik butuh `OPENROUTER_API_KEY` (atau `OPENAI_API_KEY`).
  Tanpa itu, sistem otomatis turun ke lapis URL + judul — tetap berfungsi,
  hanya tidak bisa menangkap parafrase.
- Artikel KB tanpa embedding (`embedding IS NULL`) **tidak ikut dibandingkan**.
  Cek jumlahnya: `SELECT count(*) FROM knowledge_base WHERE embedding IS NULL;`
