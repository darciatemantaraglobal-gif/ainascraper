/**
 * Penyimpanan bearer token di sisi klien.
 *
 * KENAPA PERLU: FE (vercel.app) dan BE (railway.app) adalah site yang berbeda.
 * Cookie session cross-site butuh SameSite=None, dan Safari/Brave memblokir
 * third-party cookie secara default -> user di browser itu tidak akan pernah
 * bisa login kalau kita hanya mengandalkan cookie.
 *
 * Token ini adalah jalur auth kedua. Kalau kamu nanti pakai custom domain
 * (app.domain.com + api.domain.com), cookie jadi same-site dan token ini
 * jadi sekadar cadangan yang tidak berbahaya.
 */
const STORAGE_KEY = "aina.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / storage disabled — cookie tetap jadi fallback */
  }
}

export function clearToken(): void {
  setToken(null);
}
