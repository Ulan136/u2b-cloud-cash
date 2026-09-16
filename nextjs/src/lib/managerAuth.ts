import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

// Хеш пароля (scrypt, соль в самом значении): "salt:hash".
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = (stored ?? "").split(":");
  if (!salt || !hash) return false;
  const h = scryptSync(pw, salt, 64);
  const hb = Buffer.from(hash, "hex");
  return h.length === hb.length && timingSafeEqual(h, hb);
}

// Текущий менеджер из cookie (ставится при входе). Небольшой JSON {id,name,isAdmin}.
export type CookieManager = { id: number; name: string; isAdmin: boolean };
export const MANAGER_COOKIE = "u2b_manager";

export function managerFromReq(req: NextRequest): CookieManager | null {
  const c = req.cookies.get(MANAGER_COOKIE)?.value;
  if (!c) return null;
  try {
    const m = JSON.parse(decodeURIComponent(c));
    if (m && typeof m.name === "string") return { id: Number(m.id), name: m.name, isAdmin: !!m.isAdmin };
  } catch {
    // битый cookie — игнорируем
  }
  return null;
}

// Имя автора для записи операции (или null, если не вошёл).
export function authorFromReq(req: NextRequest): string | null {
  return managerFromReq(req)?.name ?? null;
}
