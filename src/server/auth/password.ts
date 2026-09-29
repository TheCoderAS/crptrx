import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { audit } from "../audit";
import { randomToken, sha256 } from "../crypto";
import { prisma } from "../db";
import { env } from "../env";
import { AppError } from "../errors";
import { sendEmail } from "../notify";
import { rateLimit } from "../ratelimit";
import { getSettings } from "../settings";

// Email + password sign-in for users. Every entry point re-reads the admin
// settings, so switching the method off takes effect on the next request.

export const USER_MIN_PASSWORD = 8;
export const USER_MAX_FAILED = 5;
export const USER_LOCK_MS = 15 * 60_000;
const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 30 * 60_000;
const DUMMY_HASH = "$2a$12$abcdefghijklmnopqrstuuJ0k2m3vY0Q8Qe4xg8o1W1c2W3e4r5t6";

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const normalizeEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();

export function checkUserPassword(p: unknown): string {
  if (typeof p !== "string" || p.length < USER_MIN_PASSWORD) throw new AppError(`Use at least ${USER_MIN_PASSWORD} characters for your password.`);
  if (p.length > 200) throw new AppError("That password is too long.");
  if (/^(.)\1*$/.test(p)) throw new AppError("Choose a less predictable password.");
  return p;
}

async function assertEmailSignInOn() {
  if (!(await getSettings()).auth_email_enabled) throw new AppError("Email sign-in is turned off. Please use another sign-in option.", 403, "METHOD_OFF");
}

async function issueToken(userId: string, purpose: "VERIFY_EMAIL" | "RESET_PASSWORD", ttlMs: number) {
  // Only the newest link of each kind works.
  await prisma.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
  const token = randomToken();
  await prisma.emailToken.create({ data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

async function consumeToken(token: string, purpose: "VERIFY_EMAIL" | "RESET_PASSWORD") {
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(String(token ?? "")) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date())
    throw new AppError(purpose === "VERIFY_EMAIL" ? "This link has expired or was already used. Ask for a new one." : "This reset link has expired or was already used. Ask for a new one.");
  // Conditional update, so a link can't be used twice at the same moment.
  const { count } = await prisma.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count !== 1) throw new AppError("This link was already used.");
  return row;
}

export async function sendVerificationEmail(user: Pick<User, "id" | "email">) {
  const token = await issueToken(user.id, "VERIFY_EMAIL", VERIFY_TTL_MS);
  const brand = (await getSettings()).brand_name;
  await sendEmail(
    user.email,
    `Confirm your email for ${brand}`,
    `Confirm your email address by opening this link (valid for 24 hours):\n\n${env.appUrl}/verify-email?token=${token}\n\nIf you didn't create an account, ignore this email.`,
  );
}

/** Returns the new user, or null when the email is already registered (we don't say so on screen). */
export async function registerWithPassword(emailInput: unknown, passwordInput: unknown, ip: string | null): Promise<User | null> {
  await assertEmailSignInOn();
  await rateLimit(`signup:${ip}`, 10, 60 * 60);
  const email = normalizeEmail(emailInput);
  if (!EMAIL_RE.test(email) || email.length > 200) throw new AppError("Enter a valid email address.");
  const password = checkUserPassword(passwordInput);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Tell the real owner by email instead of revealing it on screen.
    await rateLimit(`signup-exists:${email}`, 3, 60 * 60);
    await sendEmail(
      email,
      "Someone tried to sign up with your email",
      `Someone tried to create a new account with this email. You already have one.\n\nSign in: ${env.appUrl}/login\nForgot your password? ${env.appUrl}/forgot-password\n\nIf this wasn't you, you can ignore this email.`,
    );
    return null;
  }
  const user = await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 12), emailVerified: false } });
  await audit({ type: "USER", id: user.id }, "USER_SIGNED_UP", { details: { provider: "password" }, ip });
  await sendVerificationEmail(user);
  return user;
}

export async function loginWithPassword(emailInput: unknown, passwordInput: unknown, ip: string | null): Promise<User> {
  await assertEmailSignInOn();
  await rateLimit(`login:${ip}`, 20, 15 * 60);
  const email = normalizeEmail(emailInput);
  const password = String(passwordInput ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  const fail = async (reason: string) => {
    await audit({ type: "USER", id: user?.id ?? null }, "USER_LOGIN_FAILED", { details: { reason, provider: "password" }, ip });
    throw new AppError("Wrong email or password.", 401, "BAD_LOGIN");
  };
  if (!user || !user.passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH); // same timing whether or not the account exists
    return fail(user ? "no password set" : "unknown email");
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({ type: "USER", id: user.id }, "USER_LOGIN_FAILED", { details: { reason: "locked" }, ip });
    throw new AppError("Too many wrong attempts. Try again in 15 minutes, or reset your password.", 423, "LOCKED");
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: failed >= USER_MAX_FAILED ? { failedLogins: 0, lockedUntil: new Date(Date.now() + USER_LOCK_MS) } : { failedLogins: failed },
    });
    return fail(failed >= USER_MAX_FAILED ? "wrong password, now locked" : "wrong password");
  }
  if (user.status !== "ACTIVE") {
    await audit({ type: "USER", id: user.id }, "USER_LOGIN_FAILED", { details: { reason: "disabled" }, ip });
    throw new AppError("This account is disabled. Please contact support.", 403);
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await audit({ type: "USER", id: user.id }, "USER_LOGIN", { details: { provider: "password" }, ip });
  return user;
}

export async function verifyEmail(token: unknown) {
  const row = await consumeToken(String(token ?? ""), "VERIFY_EMAIL");
  await prisma.user.update({ where: { id: row.userId }, data: { emailVerified: true } });
  await audit({ type: "USER", id: row.userId }, "EMAIL_VERIFIED");
  return row.userId;
}

export async function resendVerification(user: User) {
  if (user.emailVerified) return;
  await rateLimit(`verify-resend:${user.id}`, 3, 60 * 60);
  await sendVerificationEmail(user);
}

/** Always "succeeds" on screen so nobody can test which emails have accounts. */
export async function requestPasswordReset(emailInput: unknown, ip: string | null) {
  await assertEmailSignInOn();
  await rateLimit(`forgot:${ip}`, 10, 60 * 60);
  const email = normalizeEmail(emailInput);
  if (!EMAIL_RE.test(email)) throw new AppError("Enter a valid email address.");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return;
  await rateLimit(`forgot-email:${email}`, 3, 60 * 60);
  const token = await issueToken(user.id, "RESET_PASSWORD", RESET_TTL_MS);
  await sendEmail(
    email,
    "Reset your password",
    `Open this link to choose a new password (valid for 30 minutes):\n\n${env.appUrl}/reset-password?token=${token}\n\nIf you didn't ask for this, ignore this email. Your password stays the same.`,
  );
  await audit({ type: "USER", id: user.id }, "PASSWORD_RESET_REQUESTED", { ip });
}

export async function resetPassword(token: unknown, passwordInput: unknown, ip: string | null) {
  await assertEmailSignInOn();
  const password = checkUserPassword(passwordInput);
  const row = await consumeToken(String(token ?? ""), "RESET_PASSWORD");
  // The link proves they own the inbox, so the email counts as confirmed.
  const user = await prisma.user.update({
    where: { id: row.userId },
    data: { passwordHash: await bcrypt.hash(password, 12), emailVerified: true, failedLogins: 0, lockedUntil: null },
  });
  // Sign out everywhere else.
  await prisma.session.deleteMany({ where: { subjectType: "USER", subjectId: user.id } });
  await audit({ type: "USER", id: user.id }, "PASSWORD_RESET", { ip });
  await sendEmail(user.email, "Your password was changed", `Your password was just reset. If this wasn't you, contact support right away.`);
  return user;
}

/** Set a first password (e.g. a Google user) or change the current one. */
export async function setPassword(user: User, current: unknown, next: unknown, ip: string | null) {
  await assertEmailSignInOn();
  await rateLimit(`set-password:${user.id}`, 5, 15 * 60);
  if (user.passwordHash && !(await bcrypt.compare(String(current ?? ""), user.passwordHash))) throw new AppError("Your current password isn't right.");
  const password = checkUserPassword(next);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  await audit({ type: "USER", id: user.id }, user.passwordHash ? "PASSWORD_CHANGED" : "PASSWORD_SET", { ip });
  await sendEmail(user.email, "Your password was changed", `The password for your account was just ${user.passwordHash ? "changed" : "set"}. If this wasn't you, reset it right away: ${env.appUrl}/forgot-password`);
}
