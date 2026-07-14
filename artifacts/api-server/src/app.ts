import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors, { type CorsOptions } from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/session";
import { resolveUser } from "./middlewares/auth";
import { CORS_ORIGINS, isProduction } from "./lib/env";

const app: Express = express();

// Railway/Render mem-proxy request. Tanpa ini req.secure salah dan cookie
// Secure tidak terkirim, plus logging melihat IP proxy alih-alih IP user.
app.set("trust proxy", 1);
app.disable("x-powered-by");

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Request tanpa Origin (curl, health check, server-to-server) selalu boleh.
    if (!origin) return callback(null, true);

    // Di dev, kalau allowlist kosong, izinkan semua supaya nggak ribet.
    if (!isProduction && CORS_ORIGINS.length === 0) return callback(null, true);

    const normalized = origin.replace(/\/+$/, "");
    if (CORS_ORIGINS.includes(normalized)) return callback(null, true);

    // Opsional: izinkan semua preview deployment Vercel.
    if (
      process.env.ALLOW_VERCEL_PREVIEWS === "true" &&
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(normalized)
    ) {
      return callback(null, true);
    }

    logger.warn({ origin }, "CORS ditolak - origin tidak ada di CORS_ORIGINS");
    return callback(new Error(`Origin tidak diizinkan: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86_400,
};

app.use(cors(corsOptions));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// PDF dikirim sebagai base64 di dalam JSON body.
// Default express cuma 100kb -> PDF apa pun langsung 413. Naikkan.
const bodyLimit = process.env.BODY_LIMIT ?? "15mb";
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

app.use(sessionMiddleware);
app.use(resolveUser);

app.use("/api", router);

// 404 khusus /api -> FE selalu dapat JSON, bukan HTML.
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan" });
});

// Error handler terpusat. Express 5 otomatis meneruskan rejected promise ke sini,
// jadi route async yang throw tidak lagi menggantung tanpa response.
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ err }, "Unhandled error");

  if (res.headersSent) return;

  if (err.message?.startsWith("Origin tidak diizinkan")) {
    res.status(403).json({ error: err.message });
    return;
  }

  res.status(500).json({
    error: isProduction ? "Terjadi kesalahan pada server." : err.message,
  });
});

export default app;
