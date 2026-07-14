import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    // CATATAN: api/index.ts (handler Vercel serverless) sengaja dihapus.
    //   - scrapeInstagramPost() menunggu Apify hingga 90 detik -> lewat batas
    //     eksekusi fungsi Vercel.
    //   - /drafts/:id/approve menjalankan processAndStoreArticle() fire-and-forget;
    //     di serverless proses dibunuh begitu response terkirim, jadi pipeline
    //     embedding tidak pernah selesai.
    //   - pg.Pool baru tiap invocation -> connection storm ke Supabase.
    // API server ini HARUS long-lived (Railway / Render / Fly / VPS).
    //
    // entryPoints memakai bentuk OBJEK, bukan array. Dengan array, esbuild
    // menghitung common-base dari daftar entry — menambah/menghapus satu entry
    // diam-diam menggeser output (dist/src/index.mjs -> dist/index.mjs) dan
    // start command langsung "Cannot find module". Bentuk objek mengunci nama
    // output secara eksplisit.
    entryPoints: {
      "src/index": path.resolve(artifactDir, "src/index.ts"),
      "src/seed": path.resolve(artifactDir, "src/seed.ts"),
    },
    platform: "node",
    target: "node22",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    minify: isProduction,
    sourcemap: isProduction ? "linked" : true,
    logLevel: "info",
    // Shim require() untuk dependency CJS (express, debug, dll) di output ESM.
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
    plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    external: [
      "pg-native",
      "better-sqlite3",
      "mysql",
      "mysql2",
      "oracledb",
      "tedious",
      "pg-query-stream",
    ],
  });
}

buildAll().catch((e) => {
  console.error(e);
  process.exit(1);
});
