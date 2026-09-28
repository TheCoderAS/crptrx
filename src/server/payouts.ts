import type { PayoutMethod, Prisma } from "@prisma/client";
import { audit, type Actor } from "./audit";
import { decrypt, encrypt } from "./crypto";
import { prisma } from "./db";
import { AppError } from "./errors";

// Payout method logic is its own module so automatic bank-name checks (R2) can slot in here.
export const MAX_PAYOUT_METHODS = 3;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

export interface PayoutSnapshot {
  type: "BANK" | "UPI";
  holderName: string;
  accountNumberEncrypted?: string | null;
  accountLast4?: string | null;
  ifsc?: string | null;
  upiId?: string | null;
}

export function payoutSnapshot(pm: PayoutMethod): Prisma.InputJsonValue {
  const snap: PayoutSnapshot = {
    type: pm.type,
    holderName: pm.holderName,
    accountNumberEncrypted: pm.accountNumberEncrypted,
    accountLast4: pm.accountLast4,
    ifsc: pm.ifsc,
    upiId: pm.upiId,
  };
  return snap as unknown as Prisma.InputJsonValue;
}

/** What users see: never the full account number. */
export function maskedPayout(p: PayoutSnapshot | PayoutMethod): string {
  if (p.type === "UPI") {
    const [name, host] = (p.upiId ?? "").split("@");
    return `UPI ${name.slice(0, 2)}${"•".repeat(Math.max(name.length - 2, 2))}@${host ?? ""}`;
  }
  return `Bank a/c ending ${p.accountLast4 ?? "••••"}${p.ifsc ? ` (${p.ifsc})` : ""}`;
}
export const payoutLast4 = (p: PayoutSnapshot) => (p.type === "UPI" ? (p.upiId ?? "").slice(-4) : p.accountLast4);

/** Only admins paying out see this. */
export const fullAccountNumber = (p: PayoutSnapshot) => (p.accountNumberEncrypted ? decrypt(p.accountNumberEncrypted) : null);

export async function addPayoutMethod(
  userId: string,
  input: { type: "BANK" | "UPI"; holderName: string; accountNumber?: string; accountNumberConfirm?: string; ifsc?: string; upiId?: string },
  actor: Actor,
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.kycStatus !== "APPROVED") throw new AppError("Finish your identity check before adding a payout method.", 403);
  const count = await prisma.payoutMethod.count({ where: { userId, deletedAt: null } });
  if (count >= MAX_PAYOUT_METHODS) throw new AppError(`You can save up to ${MAX_PAYOUT_METHODS} payout methods.`);
  const holderName = input.holderName.trim().replace(/\s+/g, " ");
  if (holderName.length < 2) throw new AppError("Enter the account holder name.");
  let data: Prisma.PayoutMethodUncheckedCreateInput;
  if (input.type === "BANK") {
    const acc = (input.accountNumber ?? "").replace(/\s/g, "");
    if (!/^\d{9,18}$/.test(acc)) throw new AppError("Account number should be 9 to 18 digits.");
    if (acc !== (input.accountNumberConfirm ?? "").replace(/\s/g, "")) throw new AppError("The two account numbers don't match.");
    const ifsc = (input.ifsc ?? "").trim().toUpperCase();
    if (!IFSC.test(ifsc)) throw new AppError("Enter a valid IFSC code, e.g. HDFC0001234.");
    data = { userId, type: "BANK", holderName, accountNumberEncrypted: encrypt(acc), accountLast4: acc.slice(-4), ifsc };
  } else if (input.type === "UPI") {
    const upi = (input.upiId ?? "").trim();
    if (!UPI.test(upi)) throw new AppError("Enter a valid UPI ID, e.g. name@okhdfcbank.");
    data = { userId, type: "UPI", holderName, upiId: upi };
  } else throw new AppError("Choose bank account or UPI.");
  data.isDefault = count === 0;
  const pm = await prisma.payoutMethod.create({ data });
  await audit(actor, "PAYOUT_METHOD_ADDED", { targetType: "payout_method", targetId: pm.id, details: { type: pm.type } });
  return pm;
}

/** Soft delete: past orders keep their snapshot. */
export async function deletePayoutMethod(userId: string, id: string, actor: Actor) {
  const pm = await prisma.payoutMethod.findFirst({ where: { id, userId, deletedAt: null } });
  if (!pm) throw new AppError("Payout method not found", 404);
  await prisma.payoutMethod.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
  if (pm.isDefault) {
    const next = await prisma.payoutMethod.findFirst({ where: { userId, deletedAt: null }, orderBy: { createdAt: "asc" } });
    if (next) await prisma.payoutMethod.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  await audit(actor, "PAYOUT_METHOD_DELETED", { targetType: "payout_method", targetId: id });
}

export async function setDefaultPayoutMethod(userId: string, id: string) {
  const pm = await prisma.payoutMethod.findFirst({ where: { id, userId, deletedAt: null } });
  if (!pm) throw new AppError("Payout method not found", 404);
  await prisma.$transaction([
    prisma.payoutMethod.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.payoutMethod.update({ where: { id }, data: { isDefault: true } }),
  ]);
}

/** Loose comparison used to highlight mismatches for the reviewer (not an automatic decision). */
export function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/).filter(Boolean).sort().join(" ");
  return norm(a) === norm(b);
}

export async function reviewPayoutMethod(id: string, decision: "APPROVED" | "DECLINED", reason: string | undefined, actor: Actor) {
  if (decision === "DECLINED" && !reason?.trim()) throw new AppError("A reason is required to decline.");
  const pm = await prisma.payoutMethod.findUnique({ where: { id } });
  if (!pm || pm.deletedAt) throw new AppError("Payout method not found", 404);
  if (pm.status !== "PENDING") throw new AppError("This payout method was already reviewed.");
  const updated = await prisma.payoutMethod.update({
    where: { id },
    data: { status: decision, reason: reason?.trim() || null, reviewerId: actor.id, reviewedAt: new Date() },
  });
  await audit(actor, `PAYOUT_METHOD_${decision}`, { targetType: "payout_method", targetId: id, details: { reason: reason ?? null } });
  return updated;
}
