import { createRoot } from 'react-dom/client';
import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react';

import App from './App';
import { getToken } from './lib/auth-token';

import './index.css';

// ---------------------------------------------------------------------------
// Konfigurasi API client — HARUS dijalankan sebelum request pertama.
//
// Orval meng-generate semua path sebagai "/api/...", jadi tanpa base URL,
// FE di Vercel akan menembak dirinya sendiri (https://app.vercel.app/api/...)
// dan cuma dapat index.html balik. Itu penyebab semua request "gagal" diam-diam.
// ---------------------------------------------------------------------------
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '') ?? '';

if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
} else if (import.meta.env.PROD) {
  // Gagal keras di production kalau env belum di-set — jauh lebih baik daripada
  // aplikasi yang loading selamanya tanpa pesan error.
  console.error(
    '[AINA] VITE_API_BASE_URL belum di-set. Set di Vercel > Settings > Environment Variables, ' +
      'contoh: https://aina-api.up.railway.app',
  );
}

// Lampirkan Authorization: Bearer <token> otomatis di setiap request.
setAuthTokenGetter(() => getToken());

createRoot(document.getElementById('root')!).render(<App />);
