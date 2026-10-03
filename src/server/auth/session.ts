import { cookies, headers } from "next/headers";
import { cache } from "react";
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

/**
 * The visitor's IP, for rate limits and the admin allow-list. The leftmost
 * X-Forwarded-For entry is whatever the browser sent, so we count from the
 * right: TRUSTED_PROXY_HOPS proxies we run (default 1: one HTTPS proxy)
 * each appended one entry.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const hops = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 0);
  if (hops === 0) return null;
  const list = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return list[list.length - hops] ?? null;
}

/** sha256 id of the current session cookie, if any. */
export async function currentSessionId(kind: "USER" | "ADMIN"): Promise<string | null> {
  const token = (await cookies()).get(kind === "ADMIN" ? ADMIN_COOKIE : USER_COOKIE)?.value;
  return token ? sha256(token) : null;
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

// One session lookup per page render, shared by the layout and the page (React
// cache; outside rendering, e.g. in API routes, it reads fresh every time).
const loadSession = cache(loadSessionUncached);

async function loadSessionUncached(cookieName: string, subjectType: string, idleMs: number, touch = true) {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { id: sha256(token) } });
  const now = Date.now();
  if (!s || s.subjectType !== subjectType || s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > idleMs) {
    if (s) await prisma.session.delete({ where: { id: s.id } }).catch(() => undefined);
    return null;
  }
  // Touch at most once a minute.
  if (touch && now - s.lastSeenAt.getTime() > 60_000) await prisma.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
  return s;
}

// Admin sessions are NOT kept alive by requests: the panel's background checks
// (live counts every 20 s, chat updates) would keep an unattended tab logged in
// forever. Instead the browser reports real activity (clicks, typing, opening a
// page) through /api/admin/session; idle time is time since the last of those.

/** When the current admin session ends: idle (no activity) and the hard 12-hour limit. */
export async function adminSessionTimes(): Promise<{ idleEndsAt: Date; hardEndsAt: Date } | null> {
  const s = await loadSession(ADMIN_COOKIE, "ADMIN", ADMIN_IDLE_MS, false);
  if (!s) return null;
  return { idleEndsAt: new Date(s.lastSeenAt.getTime() + ADMIN_IDLE_MS), hardEndsAt: s.expiresAt };
}

/** The admin is active right now: restart the idle clock. */
export async function touchAdminSession() {
  const id = await currentSessionId("ADMIN");
  if (id) await prisma.session.updateMany({ where: { id, subjectType: "ADMIN" }, data: { lastSeenAt: new Date() } });
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
  // Logging in with a 2FA code counts as a fresh check for sensitive actions.
  if (token) await prisma.session.update({ where: { id: sha256(token) }, data: { stage: "FULL", lastSeenAt: new Date(), stepUpAt: new Date() } });
}

/** Sensitive admin actions reuse a 2FA code entered in the last 15 minutes. */
export const STEP_UP_MS = 15 * 60_000;

export async function adminStepUpFresh(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const s = await prisma.session.findUnique({ where: { id: sha256(token) } });
  return !!s?.stepUpAt && Date.now() - s.stepUpAt.getTime() < STEP_UP_MS;
}

export async function markAdminStepUp() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (token) await prisma.session.update({ where: { id: sha256(token) }, data: { stepUpAt: new Date() } });
}

export const currentUser = cache(currentUserUncached);
async function currentUserUncached(): Promise<User | null> {
  const s = await loadSession(USER_COOKIE, "USER", USER_IDLE_MS);
  if (!s) return null;
  const u = await prisma.user.findUnique({ where: { id: s.subjectId } });
  return u && u.status === "ACTIVE" ? u : null;
}

/** True when the admin requires a confirmed email and this user hasn't confirmed it yet. */
export async function needsEmailVerification(u: User): Promise<boolean> {
  return !u.emailVerified && (await getSettings()).auth_email_verification_required;
}

export async function requireUser(opts: { allowUnverified?: boolean } = {}): Promise<User> {
  const u = await currentUser();
  if (!u) throw new AppError("Please log in.", 401, "UNAUTHENTICATED");
  if (!opts.allowUnverified && (await needsEmailVerification(u))) throw new AppError("Please confirm your email address first. Check your inbox for the link.", 403, "EMAIL_UNVERIFIED");
  return u;
}

/** Admin whose password is checked but who still owes a 2FA code. */
export async function pendingAdmin(): Promise<Admin | null> {
  const s = await loadSession(ADMIN_COOKIE, "ADMIN", ADMIN_IDLE_MS, false);
  if (!s) return null;
  const a = await prisma.admin.findUnique({ where: { id: s.subjectId } });
  return a && a.status === "ACTIVE" ? a : null;
}

export const currentAdmin = cache(currentAdminUncached);
async function currentAdminUncached(): Promise<Admin | null> {
  const s = await loadSession(ADMIN_COOKIE, "ADMIN", ADMIN_IDLE_MS, false);
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
