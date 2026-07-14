---
name: esbuild ESM + CJS shim
description: ESM-format esbuild bundles of Express/Node apps need a CJS require compatibility banner, and the output path structure preserves src/ subdirectory.
---

## Rule
When bundling a Node.js Express server with esbuild in ESM format (`format: "esm"`), two things must be true:

1. **Add a CJS require banner** so CJS deps (express, debug, body-parser) can call `require('tty')` etc:
   ```js
   banner: {
     js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
   }
   ```

2. **The output path preserves the source dir structure.** If `entryPoints` includes `src/index.ts` and `outdir` is `dist`, the output is `dist/src/index.mjs` — NOT `dist/index.mjs`. Start scripts and artifact.toml production run args must use `dist/src/index.mjs`.

**Why:** Without the banner, CJS packages that call `require('tty')` at module load time throw "Dynamic require of X is not supported". esbuild's `platform: "node"` alone does not prevent this for deeply-nested CJS dependencies.

**How to apply:** Every new api-server build config that uses ESM format should include the banner. Check `artifacts/api-server/build.mjs`.
