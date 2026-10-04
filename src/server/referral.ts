import { randomInt } from "node:crypto";
import { audit, type Actor } from "./audit";
import { prisma, type Tx } from "./db";
import { AppError } from "./errors";
import { D } from "./money";

/** Invite codes: 4 to 16 letters or digits, stored in capitals. */
export const INVITE_CODE_RE = /^[A-Z0-9]{4,16}$/;
export const INVITE_NOT_FOUND = "Code not found. Check it, or clear it to continue without one.";

export const normalizeInviteCode = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

/** An easy-to-read code (no 0/O, 1/I) for when the super admin leaves the box empty. */
export function randomInviteCode(len = 8) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => abc[randomInt(abc.length)]).join("");
}

/** The active admin who owns this code, or null. Super admins have no code: their customers are the house. */
export async function adminForInviteCode(code: unknown, tx: Tx = prisma) {
  const c = normalizeInviteCode(code);
  if (!INVITE_CODE_RE.test(c)) return null;
  return tx.admin.findFirst({ where: { inviteCode: c, status: "ACTIVE", role: "ADMIN" }, select: { id: true, name: true } });
}

/**
 * Turns the code typed at sign-up into an admin id. Empty = no admin.
 * `soft`: a stale code remembered from an old link is ignored instead of refused.
 */
export async function resolveInvite(code: unknown, soft = false): Promise<string | null> {
  const c = normalizeInviteCode(code);
  if (!c) return null;
  const admin = await adminForInviteCode(c);
  if (!admin && !soft) throw new AppError(INVITE_NOT_FOUND, 422, "INVITE_NOT_FOUND");
  return admin?.id ?? null;
}

/** Checks the referral fields the super admin sets on an admin. */
export function checkReferralFields(input: { inviteCode?: unknown; profitPercent?: unknown }) {
  const code = normalizeInviteCode(input.inviteCode);
  if (code && !INVITE_CODE_RE.test(code)) throw new AppError("Invite code: 4 to 16 letters or numbers, no spaces.");
  const pct = String(input.profitPercent ?? "").trim() || "0";
  if (!/^\d+(\.\d{1,4})?$/.test(pct) || D(pct).gt(100)) throw new AppError("Profit share: a percentage from 0 to 100.");
  return { inviteCode: code || null, profitPercent: pct };
}

/** Saves an invite code, turning the unique-index error into a readable one. */
export async function saveReferral(adminId: string, data: { inviteCode: string | null; profitPercent: string }) {
  try {
    return await prisma.admin.update({ where: { id: adminId }, data });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new AppError("Another admin already uses this invite code.", 409);
    throw e;
  }
}

/** Moves a customer to an admin (or to the house with null). Paid orders keep their earnings. Logged. */
export async function reassignCustomer(userId: string, adminId: string | null, actor: Actor, reason: string, ip?: string | null) {
  if (reason.trim().length < 5) throw new AppError("Write why you're moving this customer.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, adminId: true } });
  if (!user) throw new AppError("Customer not found", 404, "NOT_FOUND");
  if (adminId) {
    const a = await prisma.admin.findUnique({ where: { id: adminId }, select: { role: true, status: true } });
    if (!a || a.role !== "ADMIN" || a.status !== "ACTIVE") throw new AppError("Choose an active admin.");
  }
  if (user.adminId === adminId) return;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { adminId, referredAt: adminId ? new Date() : null } });
    await audit(actor, "CUSTOMER_REASSIGNED", { targetType: "user", targetId: userId, details: { from: user.adminId, to: adminId, reason: reason.trim() }, ip }, tx);
  });
}

/** A disabled admin's customers go back to the house; their past earnings stay. */
export async function releaseCustomers(adminId: string, actor: Actor, tx: Tx) {
  const { count } = await tx.user.updateMany({ where: { adminId }, data: { adminId: null, referredAt: null } });
  if (count) await audit(actor, "CUSTOMERS_RELEASED", { targetType: "admin", targetId: adminId, details: { count } }, tx);
  return count;
}
