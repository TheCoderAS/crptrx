import { randomInt } from "node:crypto";
import { audit } from "../audit";
import { safeEqual, sha256 } from "../crypto";
import { prisma } from "../db";
import { env } from "../env";
import { AppError } from "../errors";
import { sendSms } from "../notify";
import { rateLimit } from "../ratelimit";
import { resolveInvite } from "../referral";
import type { FirebaseIdentity } from "./firebase";

/** Find or create the user for a verified Google identity. */
export async function upsertUserFromIdentity(id: FirebaseIdentity, ip: string | null, invite?: { code?: unknown; soft?: boolean }) {
  if (!id.emailVerified) throw new AppError("Please use a Google account with a verified email address.", 403);
  let user = await prisma.user.findFirst({ where: { OR: [{ firebaseUid: id.uid }, { email: id.email }] } });
  if (user && user.firebaseUid && user.firebaseUid !== id.uid) throw new AppError("This email is linked to a different sign-in. Contact support.", 409);
  if (!user) {
    // The invite code counts only for a new account: an existing customer's admin never changes this way.
    const adminId = await resolveInvite(invite?.code, invite?.soft);
    user = await prisma.user.create({ data: { email: id.email, emailVerified: true, firebaseUid: id.uid, displayName: id.name, adminId, referredAt: adminId ? new Date() : null } });
    await audit({ type: "USER", id: user.id }, "USER_SIGNED_UP", { details: { provider: id.provider ?? "google", adminId }, ip });
  } else if (!user.firebaseUid) {
    // Linking Google to an email account. If that email was never confirmed,
    // whoever set the password didn't prove they own the inbox: drop it.
    const dropPassword = !user.emailVerified && !!user.passwordHash;
    user = await prisma.user.update({
      where: { id: user.id },
      data: { firebaseUid: id.uid, emailVerified: true, ...(dropPassword ? { passwordHash: null } : {}) },
    });
    if (dropPassword) {
      await prisma.session.deleteMany({ where: { subjectType: "USER", subjectId: user.id } });
      await audit({ type: "USER", id: user.id }, "UNVERIFIED_PASSWORD_REMOVED", { details: { reason: "Google sign-in proved email ownership" }, ip });
    }
  }
  if (user.status !== "ACTIVE") {
    await audit({ type: "USER", id: user.id }, "USER_LOGIN_FAILED", { details: { reason: "disabled" }, ip });
    throw new AppError("This account is disabled. Please contact support.", 403);
  }
  await audit({ type: "USER", id: user.id }, "USER_LOGIN", { ip });
  return user;
}

export const normalizeMobile = (m: string) => {
  const digits = m.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) throw new AppError("Enter a 10-digit Indian mobile number.");
  return `+91${digits}`;
};

const OTP_TTL_MS = 10 * 60_000;

/** Returns the code only when dev tools are on (test phase), so testers can see it on screen. */
export async function sendMobileOtp(userId: string, mobileInput: string): Promise<string | null> {
  const mobile = normalizeMobile(mobileInput);
  await rateLimit(`otp:${userId}`, 3, 15 * 60);
  await rateLimit(`otp-mobile:${mobile}`, 5, 60 * 60);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.otpCode.create({ data: { userId, mobile, codeHash: sha256(`${userId}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
  await sendSms(mobile, `${code} is your verification code. It expires in 10 minutes. Never share it.`, code);
  // Shown on screen only in test phases (never in Live mode).
  const { getSettings } = await import("../settings");
  return env.devToolsEnabled && (await getSettings()).network_mode === "TEST" ? code : null;
}

export async function verifyMobileOtp(userId: string, code: string) {
  const otp = await prisma.otpCode.findFirst({ where: { userId, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!otp || otp.expiresAt < new Date()) throw new AppError("The code has expired. Ask for a new one.");
  if (otp.attempts >= 5) throw new AppError("Too many wrong codes. Ask for a new one.", 429);
  if (!safeEqual(otp.codeHash, sha256(`${userId}:${String(code).trim()}`))) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new AppError("That code isn't right.");
  }
  await prisma.$transaction([
    prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: userId }, data: { mobile: otp.mobile, mobileVerifiedAt: new Date() } }),
  ]);
  await audit({ type: "USER", id: userId }, "MOBILE_VERIFIED");
}
