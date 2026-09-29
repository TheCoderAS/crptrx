import bcrypt from "bcryptjs";
import type { Admin } from "@prisma/client";
import { audit } from "../audit";
import { decrypt, encrypt } from "../crypto";
import { prisma } from "../db";
import { AppError } from "../errors";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "../totp";

export const MAX_FAILED = 5;
export const LOCK_MS = 15 * 60_000;
export const MIN_PASSWORD = 10;

export const hashPassword = (p: string) => bcrypt.hash(p, 12);

export function checkPasswordRules(p: string) {
  if (typeof p !== "string" || p.length < MIN_PASSWORD) throw new AppError(`Password must be at least ${MIN_PASSWORD} characters.`);
}

/** Password step. Locks for 15 minutes after 5 wrong attempts (spec 4.1 rule, applied to admins). */
export async function verifyAdminPassword(email: string, password: string, ip: string | null): Promise<Admin> {
  const admin = await prisma.admin.findUnique({ where: { email: email.trim().toLowerCase() } });
  const fail = async (reason: string) => {
    await audit({ type: "ADMIN", id: admin?.id ?? null }, "ADMIN_LOGIN_FAILED", { details: { email, reason }, ip });
    throw new AppError("Wrong email or password.", 401, "BAD_LOGIN");
  };
  if (!admin) {
    await bcrypt.compare(password, "$2a$12$abcdefghijklmnopqrstuuJ0k2m3vY0Q8Qe4xg8o1W1c2W3e4r5t6"); // even out timing
    return fail("unknown email");
  }
  if (admin.status !== "ACTIVE") return fail("disabled");
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    await audit({ type: "ADMIN", id: admin.id }, "ADMIN_LOGIN_FAILED", { details: { reason: "locked" }, ip });
    throw new AppError("Too many wrong attempts. The account is locked for 15 minutes.", 423, "LOCKED");
  }
  if (!(await bcrypt.compare(password, admin.passwordHash))) {
    const failed = admin.failedLogins + 1;
    await prisma.admin.update({
      where: { id: admin.id },
      data: failed >= MAX_FAILED ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: failed },
    });
    return fail(failed >= MAX_FAILED ? "wrong password, now locked" : "wrong password");
  }
  await prisma.admin.update({ where: { id: admin.id }, data: { failedLogins: 0, lockedUntil: null } });
  return admin;
}

/** Start authenticator setup: returns the secret and otpauth URL for the QR code. */
export async function beginTotpSetup(admin: Admin) {
  if (admin.totpEnabled) throw new AppError("Two-step login is already set up.");
  const secret = generateTotpSecret();
  await prisma.admin.update({ where: { id: admin.id }, data: { totpSecretEncrypted: encrypt(secret) } });
  return { secret, url: otpauthUrl(secret, admin.email, "USDT Exchange Admin") };
}

/**
 * Check a 6-digit code. Each code works once (a code can't be replayed within
 * its 30-second window). Used for login and for re-checks on sensitive actions.
 */
export async function checkAdminTotp(admin: Admin, code: string, purpose: string, ip: string | null) {
  const fresh = await prisma.admin.findUniqueOrThrow({ where: { id: admin.id } });
  if (!fresh.totpSecretEncrypted) throw new AppError("Two-step login isn't set up.", 400);
  const step = verifyTotp(decrypt(fresh.totpSecretEncrypted), String(code ?? "").trim());
  if (step === null || (fresh.lastTotpStep !== null && step <= fresh.lastTotpStep)) {
    await audit({ type: "ADMIN", id: admin.id }, "ADMIN_2FA_FAILED", { details: { purpose }, ip });
    throw new AppError("That code isn't right, or was already used. Wait for the next code and try again.", 401, "BAD_2FA");
  }
  // Conditional update: two requests racing with the same code can't both win.
  const { count } = await prisma.admin.updateMany({
    where: { id: admin.id, OR: [{ lastTotpStep: null }, { lastTotpStep: { lt: step } }] },
    data: { lastTotpStep: step, ...(fresh.totpEnabled ? {} : { totpEnabled: true }) },
  });
  if (count !== 1) throw new AppError("That code isn't right, or was already used. Wait for the next code and try again.", 401, "BAD_2FA");
  await audit({ type: "ADMIN", id: admin.id }, purpose === "login" ? "ADMIN_LOGIN" : "ADMIN_2FA_RECHECK", { details: { purpose }, ip });
}
