import { audit, type Actor } from "./audit";
import { prisma, type Tx } from "./db";
import { AppError } from "./errors";
import { pushToAdmins } from "./firebase/push";
import { D, Decimal, fmtInr } from "./money";
import { getSettings } from "./settings";

/**
 * Admins ask the super admin to pay out what they're owed. The money is sent outside the app
 * (no bank details are stored here); the super admin then uses the usual "Mark paid", which
 * closes the request. One waiting request per admin (a unique index makes sure of it).
 */

const lock = (tx: Tx, adminId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settle:${adminId}`}))`;

async function owed(tx: Tx, adminId: string) {
  const s = await tx.adminEarning.aggregate({ where: { adminId, status: "PENDING" }, _sum: { amount: true } });
  return D(s._sum.amount ?? 0);
}

export async function requestPayout(admin: { id: string; role: string; name: string }, note: unknown, actor: Actor, ip?: string | null) {
  if (admin.role !== "ADMIN") throw new AppError("Only admins ask for payouts.");
  const text = String(note ?? "").trim().slice(0, 300) || null;
  const min = D((await getSettings()).payout_request_min_inr || "0");
  const req = await prisma.$transaction(async (tx) => {
    await lock(tx, admin.id);
    if (await tx.adminPayoutRequest.findFirst({ where: { adminId: admin.id, status: "OPEN" }, select: { id: true } })) throw new AppError("You already have a request waiting.", 409);
    const amount = await owed(tx, admin.id);
    if (amount.lte(0)) throw new AppError("Nothing is owed to you yet.");
    if (amount.lt(min)) throw new AppError(`You can ask once you're owed at least ${fmtInr(min)}.`);
    const r = await tx.adminPayoutRequest.create({ data: { adminId: admin.id, amount: amount.toFixed(2), note: text } });
    await audit(actor, "ADMIN_PAYOUT_REQUESTED", { targetType: "admin", targetId: admin.id, details: { requestId: r.id, amount: amount.toFixed(2) }, ip }, tx);
    return r;
  });
  void pushToAdmins({ title: "Payout request", body: `${admin.name} asked for ${fmtInr(req.amount)}`, link: "/admin/earnings", tag: `payout-request-${admin.id}`, data: { type: "payout_request" } }, { superOnly: true });
  return req;
}

/** The admin withdraws their own waiting request. */
export async function cancelPayoutRequest(adminId: string, id: string, actor: Actor) {
  const r = await prisma.adminPayoutRequest.updateMany({ where: { id, adminId, status: "OPEN" }, data: { status: "CANCELLED", decidedBy: actor.id, decidedAt: new Date() } });
  if (r.count !== 1) throw new AppError("This request isn't waiting any more.", 404, "NOT_FOUND");
  await audit(actor, "ADMIN_PAYOUT_REQUEST_CANCELLED", { targetType: "admin", targetId: adminId, details: { requestId: id } });
}

/** Super admin says no, with a reason the admin sees. */
export async function declinePayoutRequest(id: string, reason: unknown, actor: Actor) {
  const why = String(reason ?? "").trim();
  if (why.length < 5) throw new AppError("Write why (the admin sees it).");
  const req = await prisma.adminPayoutRequest.findUnique({ where: { id }, select: { adminId: true, status: true } });
  if (!req || req.status !== "OPEN") throw new AppError("This request isn't waiting any more.", 404, "NOT_FOUND");
  const r = await prisma.adminPayoutRequest.updateMany({ where: { id, status: "OPEN" }, data: { status: "DECLINED", reason: why.slice(0, 300), decidedBy: actor.id, decidedAt: new Date() } });
  if (r.count !== 1) throw new AppError("This request isn't waiting any more.", 404, "NOT_FOUND");
  await audit(actor, "ADMIN_PAYOUT_REQUEST_DECLINED", { targetType: "admin", targetId: req.adminId, details: { requestId: id, reason: why } });
  void pushToAdmins({ title: "Payout request declined", body: why, link: "/admin/earnings", tag: `payout-request-${req.adminId}`, data: { type: "payout_request" } }, { adminId: req.adminId });
}

/** Inside settleAdmin's transaction: the payout answers the admin's waiting request, if any. */
export async function closeWithSettlement(tx: Tx, adminId: string, settlementId: string, actor: Actor) {
  await tx.adminPayoutRequest.updateMany({ where: { adminId, status: "OPEN" }, data: { status: "PAID", settlementId, decidedBy: actor.id, decidedAt: new Date() } });
}

/** A disabled admin's waiting request is closed (their earnings stay; a super admin can still pay them). */
export async function closeOnDisable(tx: Tx, adminId: string, actor: Actor) {
  await tx.adminPayoutRequest.updateMany({ where: { adminId, status: "OPEN" }, data: { status: "CANCELLED", reason: "Admin disabled", decidedBy: actor.id, decidedAt: new Date() } });
}

export const notifyPaid = (adminId: string, amount: Decimal) =>
  void pushToAdmins({ title: "Payout sent", body: `${fmtInr(amount)} was paid to you`, link: "/admin/earnings", tag: `payout-request-${adminId}`, data: { type: "payout_request" } }, { adminId });
