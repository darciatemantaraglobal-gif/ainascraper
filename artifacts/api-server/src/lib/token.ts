/**
 * Bearer token ber-tanda-tangan HMAC (stateless), tanpa dependency baru.
 *
 * KENAPA ADA: FE di Vercel dan BE di Railway itu beda registrable domain.
 * Session cookie cross-site butuh SameSite=None, dan Safari/Brave memblokir
 * third-party cookie secara default -> user Safari nggak akan pernah bisa login.
 * Token ini dipakai sebagai jalur auth kedua yang jalan di SEMUA browser.
 *
 * Format: base64url(payloadJSON).base64url(hmacSha256(payload, SESSION_SECRET))
 * Konstanta waktu saat verifikasi (timingSafeEqual) untuk cegah timing attack.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_SECRET, TOKEN_TTL_SECONDS } from "./env";

export interface TokenPayload {
  username: string;
  role: "contributor" | "admin";
  /** expiry, unix seconds */
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(data: string): string {
  return b64url(createHmac("sha256", SESSION_SECRET).update(data).digest());
}

export function createToken(user: { username: string; role: "contributor" | "admin" }): string {
  const payload: TokenPayload = {
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };

  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [body, signature] = parts as [string, string];

  const expected = Buffer.from(sign(body));
  const provided = Buffer.from(signature);

  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
    return null;
  }

  if (payload.role !== "admin" && payload.role !== "contributor") {
    return null;
  }

  return payload;
}
