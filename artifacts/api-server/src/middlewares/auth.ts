import { type Request, type Response, type NextFunction } from "express";
import { verifyToken } from "../lib/token";

export interface AuthedUser {
  username: string;
  role: "contributor" | "admin";
}

// Augment Express Request supaya route bisa baca req.user dengan type-safe.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/**
 * Resolusi user dari DUA sumber, dengan urutan:
 *   1. Authorization: Bearer <token>   (jalan di semua browser, tahan ITP)
 *   2. Session cookie                  (jalan kalau same-site / cookie diizinkan)
 *
 * Dipasang global di app.ts, sebelum router.
 */
export function resolveUser(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization ?? "";

  if (authHeader.startsWith("Bearer ")) {
    const payload = verifyToken(authHeader.slice(7).trim());
    if (payload) {
      req.user = { username: payload.username, role: payload.role };
      next();
      return;
    }
  }

  if (req.session?.user) {
    req.user = req.session.user;
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
