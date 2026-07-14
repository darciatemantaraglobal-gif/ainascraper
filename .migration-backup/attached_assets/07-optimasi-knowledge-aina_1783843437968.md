# Optimasi Knowledge AINA

Memastikan artikel yang disetujui memiliki format optimal untuk diproses AI AINA: chunking, pembersihan metadata, markdown, dan embedding.

## Spesifikasi

### Tujuan
Memastikan setiap artikel yang disetujui admin dikonversi ke format optimal agar langsung dapat dipahami dan diproses oleh AI AINA, mencakup pemecahan teks menjadi chunk, pembersihan noise, penataan ulang struktur Markdown, dan pembuatan vector embedding.
### Selesai bila
- Semua artikel yang masuk ke knowledge_base telah dipecah menjadi beberapa chunk dengan ukuran yang sesuai batas konteks AI AINA.
- Setiap chunk bebas dari noise, karakter tidak perlu, atau sisa format sumber asli yang mengganggu.
- Konten artikel telah dikonversi ke format Markdown terstruktur (heading, list, emphasis) untuk memudahkan AI membaca hierarki informasi.
- Setiap chunk telah memiliki vector embedding yang tersimpan di kolom embedding tabel knowledge_base dan siap untuk pencarian semantik.

## Sub-fitur: Chunking Teks Otomatis

Pecah artikel panjang menjadi potongan kecil (chunk) sesuai batas konteks AI AINA untuk pencarian semantik.

### Tujuan
Membagi artikel panjang menjadi potongan-potongan kecil (chunk) yang sesuai dengan batas konteks token/konteks AI AINA sehingga setiap potongan dapat dicari secara semantik tanpa melebihi kapasitas model.
### Selesai bila
- Artikel di knowledge_base sudah terbagi menjadi beberapa chunk dengan ukuran tidak melebihi batas maksimum token yang ditetapkan.
- Pemotongan dilakukan pada batas kalimat atau paragraf yang logis, tidak memutus kata atau informasi penting.
- Sistem mencatat jumlah chunk yang dihasilkan per artikel untuk verifikasi proses chunking.

## Sub-fitur: Pembersihan Metadata

Hapus noise, karakter tidak perlu, dan sisa format dari sumber asli yang dapat mengganggu pemrosesan AI.

### Tujuan
Menghapus semua elemen tidak penting seperti tag HTML, karakter aneh, spasi berlebih, dan sisa format dari sumber asli agar konten bersih dan siap diproses AI.
### Selesai bila
- Tidak ada tag HTML (seperti <br>, <p>) atau atribut style yang tersisa di konten yang disimpan di knowledge_base.
- Karakter non-standar atau simbol aneh hasil copy-paste dari sumber telah dihapus.
- Spasi ganda, baris kosong berlebihan, dan whitespace tidak perlu telah dirapikan.
- Hasil akhir hanya berisi teks bersih dan markdown dasar yang diperlukan, tanpa artefak sumber asli.

## Sub-fitur: Penyesuaian Format Markdown

Konversi konten ke struktur Markdown rapi (heading, list, emphasis) agar AI mengenali hierarki informasi.

### Tujuan
Mengonversi konten artikel ke struktur Markdown yang rapi dengan heading, bullet/numbered list, dan emphasis (tebal/miring) sehingga AI AINA dapat mengenali hierarki informasi dan poin-poin penting secara otomatis.
### Selesai bila
- Judul artikel ditulis sebagai heading level 1 (#).
- Sub-judul atau bagian penting diubah menjadi heading level 2 (##) dan seterusnya sesuai hierarki konten.
- Daftar butir-butir dalam artikel diubah menjadi bullet list (-) atau numbered list (1.) yang terstruktur.
- Istilah atau frasa kunci yang perlu ditekankan diberi format **tebal** atau *miring*.
- Konten yang tersimpan di knowledge_base memiliki struktur Markdown yang konsisten dan siap dibaca oleh AI AINA tanpa perlu pengolahan tambahan.

## Sub-fitur: Generate Embedding

Hasilkan vector embedding dari konten yang sudah di-chunk dan simpan ke kolom embedding di tabel knowledge_base.

### Tujuan
Menghasilkan vector embedding untuk setiap chunk artikel menggunakan model embedding yang sesuai dan menyimpannya ke kolom embedding di tabel knowledge_base untuk mendukung pencarian semantik oleh AI AINA.
### Selesai bila
- Setiap chunk yang telah dibersihkan dan diformat Markdown memiliki satu vector embedding yang dihasilkan.
- Vector embedding tersebut berhasil disimpan di kolom embedding pada baris yang sesuai di tabel knowledge_base.
- Admin dapat memverifikasi keberhasilan pembuatan embedding, misalnya melalui notifikasi atau indikator status.
- AI AINA dapat menggunakan embedding tersebut untuk pencarian semantik tanpa error.

## Task

### 1. Data Chunking & Markdown Formatter

Implementasi fungsi chunking dan konversi ke Markdown agar data optimal dikonsumsi oleh AI AINA.

**Prompt:**

```
Buat utilitas untuk memproses teks: 1) Bersihkan tag HTML/karakter sampah. 2) Konversi ke format Markdown bersih. 3) Lakukan recursive character chunking (ukuran ~1000 karakter) dengan overlap. Data hasil olahan harus siap masuk ke kolom 'content' di tabel 'KNOWLEDGE_BASE'.
```
