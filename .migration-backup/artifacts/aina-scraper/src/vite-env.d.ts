/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL API server, TANPA trailing slash dan TANPA "/api".
   * Contoh: https://aina-api.up.railway.app
   * Kosongkan untuk memakai origin yang sama (dev via vite proxy).
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
