import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Serializer error khusus.
 *
 * drizzle >= 0.44 membungkus error DB dalam DrizzleQueryError yang MENYIMPAN
 * `query` + `params`. Kalau objek itu dilempar apa adanya ke pino, isi params
 * ikut ter-dump — untuk query pgvector itu artinya 1536 angka float memenuhi
 * layar, dan pesan Postgres yang sebenarnya (`type "vector" does not exist`)
 * ketimbun sampai tak terbaca.
 *
 * Di sini: params DIBUANG, query dipotong, dan `cause` (pesan asli dari pg)
 * DIANGKAT ke permukaan.
 */
function errSerializer(err: Error & { cause?: unknown; query?: string; params?: unknown[] }) {
  const cause = err.cause as { message?: string; code?: string; detail?: string } | undefined;

  return {
    type: err.name,
    message: err.message?.slice(0, 500),
    stack: err.stack?.split("\n").slice(0, 6).join("\n"),
    ...(err.query ? { query: err.query.slice(0, 300) } : {}),
    ...(err.params ? { paramCount: err.params.length } : {}), // JUMLAHnya saja, bukan isinya
    ...(cause?.message ? { pgMessage: cause.message } : {}),
    ...(cause?.code ? { pgCode: cause.code } : {}),
    ...(cause?.detail ? { pgDetail: String(cause.detail).slice(0, 300) } : {}),
  };
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  serializers: { err: errSerializer },
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
