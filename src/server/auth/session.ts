import { cookies, headers } from "next/headers";
import type { Admin, User } from "@prisma/client";
import { randomToken, sha256 } from "../crypto";
import { prisma } from "../db";
import { env } from "../env";
import { AppError } from "../errors";
import { getSettings } from "../settings";

export const USER_COOKIE = "sid";
export const ADMIN_COOKIE = "asid";
const USER_IDLE_MS = 7 * 24 * 3600_000;
export const ADMIN_IDLE_MS = 30 * 60_000; // spec 10.4
const ADMIN_MAX_MS = 12 * 3600_000;

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
}

async function setCookie(name: string, token: string, maxAgeMs: number) {
  (await cookies()).set(name, token, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  });
}

export async function createSession(subjectType: "USER" | "ADMIN", subjectId: string, stage = "FULL") {
  const token = randomToken();
  const maxMs = subjectType === "ADMIN" ? ADMIN_MAX_MS : 30 * 24 * 3600_000;
  await prisma.session.create({
    data: { id: sha256(token), subjectType, subjectId, stage, expiresAt: new Date(Date.now() + maxMs) },
  });
  await setCookie(subjectType === "ADMIN" ? ADMIN_COOKIE : USER_COOKIE, token, maxMs);
}

async function loadSession(cookieName: string, subjectType: string, idleMs: number) {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { id: sha256(token) } });
  const now = Date.now();
  if (!s || s.subjectType !== subjectType || s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > idleMs) {
    if (s) await prisma.session.delete({ where: { id: s.id } }).catch(() => undefined);
    return null;
  }
  // Touch at most once a minute.
  if (now - s.lastSeenAt.getTime() > 60_000) await prisma.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
  return s;
}

export async function destroySession(kind: "USER" | "ADMIN") {
  const name = kind === "ADMIN" ? ADMIN_COOKIE : USER_COOKIE;
  const jar = await cookies();
  const token = jar.get(name)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(name);
}

export async function upgradeAdminSession() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (token) await prisma.session.update({ where: { id: sha256(token) }, data: { stage: "FULL", lastSeenAt: new Date() } });
}

export async function currentUser(): Promise<User | null> {
  const s = await loadSession(USER_COOKIE, "USER", USER_IDLE_MS);
  if (!s) return null;
  const u = await prisma.user.findUnique({ where: { id: s.subjectId } });
  return u && u.status === "ACTIVE" ? u : null;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new AppError("Please log in.", 401, "UNAUTHENTICATED");
  return u;
}

/** Admin whose password is checked but who still owes a 2FA code. */
export async function pendingAdmin(): Promise<Admin | null> {
  const s = await loadSession(ADMIN_COOKIE, "ADMIN", ADMIN_IDLE_MS);
  if (!s) return null;
  const a = await prisma.admin.findUnique({ where: { id: s.subjectId } });
  return a && a.status === "ACTIVE" ? a : null;
}

export async function currentAdmin(): Promise<Admin | null> {
  const s = await loadSession(ADMIN_COOKIE, "ADMIN", ADMIN_IDLE_MS);
  if (!s || s.stage !== "FULL") return null;
  const a = await prisma.admin.findUnique({ where: { id: s.subjectId } });
  if (!a || a.status !== "ACTIVE" || !a.totpEnabled) return null;
  const allow = (await getSettings()).admin_ip_allowlist;
  if (allow.length > 0) {
    const ip = await clientIp();
    if (!ip || !allow.includes(ip)) return null;
  }
  return a;
}

export async function requireAdmin(role: "ADMIN" | "SUPER_ADMIN" = "ADMIN"): Promise<Admin> {
  const a = await currentAdmin();
  if (!a) throw new AppError("Please log in to the admin panel.", 401, "UNAUTHENTICATED");
  if (role === "SUPER_ADMIN" && a.role !== "SUPER_ADMIN") throw new AppError("Only the super admin can do this.", 403, "FORBIDDEN");
  return a;
}
