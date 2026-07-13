# Panduan Deploy — AINA Scraper

Arsitektur: **Vercel (frontend) → Railway (API server) → Supabase (Postgres)**

```
Browser
  │
  ├─► https://aina-scraper.vercel.app        Vercel — static SPA (Vite build)
  │      └─ fetch → VITE_API_BASE_URL/api/*
  │
  └─► https://aina-api.up.railway.app        Railway — Express, long-lived
         └─ pg pool → Supabase Postgres
```

## Kenapa API server TIDAK di Vercel

Handler serverless (`artifacts/api-server/api/index.ts`) sudah dihapus. Alasan teknis:

| Masalah | Dampak di serverless |
|---|---|
| `scrapeInstagramPost()` menunggu Apify `waitSecs: 90` | Lewat batas eksekusi fungsi Vercel (10s Hobby / 60s Pro) |
| `POST /drafts/:id/approve` memanggil `processAndStoreArticle()` fire-and-forget | Proses dibunuh begitu response terkirim → pipeline embedding tidak pernah selesai |
| `pg.Pool` + `connect-pg-simple` dibuat ulang tiap invocation | Connection storm ke Supabase |
| Scheduler `run_at` | Tidak ada proses yang hidup untuk menjadwalkan |

API server ini **harus long-lived**. Railway / Render / Fly / VPS — semuanya oke. Panduan di bawah pakai Railway.

---

## 1. Supabase

**a. Ambil connection string yang benar.**
Dashboard → Project Settings → Database → Connection string → **Session pooler**.

> ⚠️ Pakai **Session pooler (port 5432)**, BUKAN Transaction pooler (port 6543).
> Transaction pooler tidak mendukung session-level state yang dibutuhkan
> `connect-pg-simple`. Kalau salah pilih, login akan gagal secara acak.

**b. Buat tabel `knowledge_base`** (lewati kalau aplikasi AINA lain sudah membuatnya).
Jalankan isi `lib/db/sql/001-knowledge-base.sql` di Supabase SQL Editor.

**c. Push schema milik scraper.**
```bash
export SUPABASE_DB_URL="postgresql://postgres.xxx:PASS@aws-0-xx.pooler.supabase.com:5432/postgres"
pnpm --filter @workspace/db run push
```
Ini hanya membuat/mengubah 4 tabel: `scraper_users`, `scraper_drafts`, `cron_logs`,
`cron_settings`. `knowledge_base` tidak akan disentuh (lihat `src/schema/managed.ts`).

**d. Seed user awal.**
```bash
pnpm --filter @workspace/api-server run build
SUPABASE_DB_URL="..." node artifacts/api-server/dist/src/seed.mjs
```
Login default: `admin / admin123`. **Ganti password ini segera setelah login pertama.**

---

## 2. Railway (API server)

New Project → Deploy from GitHub repo → pilih repo ini.
Railway akan otomatis memakai `Dockerfile` di root (sesuai `railway.toml`).

**Variables yang wajib diisi:**

```bash
SUPABASE_DB_URL=postgresql://postgres.xxx:PASS@aws-0-xx.pooler.supabase.com:5432/postgres
SESSION_SECRET=<hasil: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
CORS_ORIGINS=https://aina-scraper.vercel.app
NODE_ENV=production
APP_TZ=Africa/Cairo
```

**Opsional:**
```bash
OPENROUTER_API_KEY=...     # tanpa ini, analisis AI fallback ke heuristik keyword
APIFY_API_TOKEN=...        # tanpa ini, /scrape/instagram balas 503
CRON_SECRET=...            # untuk scheduler eksternal
ALLOW_VERCEL_PREVIEWS=true # izinkan semua *.vercel.app (buat testing preview)
```

Settings → Networking → **Generate Domain**. Catat URL-nya, misal
`https://aina-api.up.railway.app`.

Cek: `curl https://aina-api.up.railway.app/api/healthz` → `{"status":"ok"}`

---

## 3. Vercel (frontend)

Import repo. Framework Preset: **Other**. Root Directory: **biarkan di root repo**
(`vercel.json` sudah mengatur build command & output directory).

**Environment Variables:**
```bash
VITE_API_BASE_URL=https://aina-api.up.railway.app
```
> Tanpa trailing slash. Tanpa `/api` di belakang — path `/api` sudah ditambahkan
> otomatis oleh API client.

Deploy. Lalu **kembali ke Railway** dan pastikan `CORS_ORIGINS` berisi domain Vercel
yang sebenarnya.

---

## 4. Soal cookie & Safari — BACA INI

FE (`*.vercel.app`) dan BE (`*.railway.app`) adalah **site yang berbeda**. Artinya
cookie session adalah *third-party cookie*, dan **Safari + Brave memblokirnya secara
default**. Ini masalah nyata, bukan teori.

Repo ini menangani itu dengan **dua jalur auth sekaligus**:
1. **Session cookie** — `SameSite=None; Secure`. Jalan di Chrome/Firefox/Edge.
2. **Bearer token** (HMAC, `lib/token.ts`) — disimpan FE di localStorage dan dikirim
   di header `Authorization`. **Jalan di semua browser**, tidak peduli kebijakan cookie.

Jadi aplikasi tetap berfungsi apa adanya. **Tapi setup yang benar-benar bersih adalah
custom domain:**

```
app.domain-lo.com  → Vercel
api.domain-lo.com  → Railway
```
Lalu set di Railway:
```bash
COOKIE_DOMAIN=.domain-lo.com
CORS_ORIGINS=https://app.domain-lo.com
```
Cookie otomatis turun ke `SameSite=Lax` (same-site), kebal blokir third-party cookie,
dan bearer token cuma jadi cadangan. **Kalau punya domain, tempuh jalur ini.**

---

## 5. Otomasi / cron

API server punya **scheduler in-process** (`lib/scheduler.ts`) yang membaca `run_at`
dari tabel `cron_settings` — jam yang diatur admin di halaman Automation sekarang
benar-benar dipakai (sebelumnya cuma dekorasi; tidak ada scheduler sama sekali di repo).

Kalau kamu menaikkan replica > 1, set `ENABLE_SCHEDULER=false` supaya job tidak jalan
dobel, lalu pakai scheduler eksternal — workflow cadangan sudah tersedia di
`.github/workflows/cron-scrape.yml` (butuh secret `CRON_SECRET` + `API_BASE_URL`).

---

## 6. Development lokal

```bash
pnpm install

# Terminal 1 — API
export DATABASE_URL="postgresql://postgres@localhost:5432/postgres"
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev     # http://localhost:3000

# Terminal 2 — Frontend
pnpm --filter @workspace/aina-scraper run dev   # http://localhost:5173
```

Vite dev server sudah mem-proxy `/api` → `http://localhost:3000`, jadi di lokal semuanya
same-origin: tidak ada urusan CORS, tidak ada urusan third-party cookie.

---

## 7. Checklist troubleshooting

| Gejala | Penyebab |
|---|---|
| Login sukses tapi langsung balik ke `/login` | `VITE_API_BASE_URL` belum di-set di Vercel, atau domain Vercel belum masuk `CORS_ORIGINS` di Railway |
| Semua request balas HTML, bukan JSON | `VITE_API_BASE_URL` kosong → FE menembak dirinya sendiri di Vercel |
| Jalan di Chrome, gagal di Safari | Third-party cookie diblokir. Bearer token harusnya menutupi ini — cek localStorage `aina.token` terisi. Solusi permanen: pakai `COOKIE_DOMAIN` + custom domain |
| `relation "knowledge_base" already exists` saat push | Sudah diperbaiki. Pastikan `drizzle.config.ts` menunjuk ke `schema/managed.ts`, bukan `schema/index.ts` |
| Upload PDF balas 413 | Naikkan `BODY_LIMIT` (default `15mb`) |
| Statistik "hari ini" reset di jam aneh | `APP_TZ` belum di-set (default `Africa/Cairo`) |
