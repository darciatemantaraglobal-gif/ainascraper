# ---------- Stage 1: build ----------
FROM node:22-slim AS builder

ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable

WORKDIR /app

# Copy manifest dulu supaya layer install ter-cache saat source berubah.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY scripts/package.json ./scripts/

RUN pnpm install --frozen-lockfile --ignore-scripts=false

COPY . .

RUN pnpm --filter @workspace/api-server run build

# ---------- Stage 2: runtime ----------
FROM node:22-slim AS runner

# Zona waktu tim. Menentukan batas "hari ini" untuk statistik target harian.
ENV NODE_ENV=production \
    PORT=3000 \
    APP_TZ=Africa/Cairo

WORKDIR /app

# esbuild sudah mem-bundle seluruh dependency ke dist/, jadi runtime image
# tidak butuh node_modules sama sekali. Image jadi jauh lebih kecil.
COPY --from=builder /app/artifacts/api-server/dist ./dist

USER node

EXPOSE 3000

# Node native fetch dipakai untuk healthcheck — tidak perlu curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "dist/src/index.mjs"]
