import type { Prisma } from "@prisma/client";
import { audit, type Actor } from "./audit";
import { prisma, type Tx } from "./db";
import { AppError } from "./errors";
import { D, Decimal, rupees } from "./money";
import { assertUser, type Viewer } from "./scope";

/**
 * Who earns what on an order (agreed with the owner):
 * - The platform fee is always the super admin's.
 * - The rate margin (usdt x (market - rate)) is split: an admin gets their profit share of it
 *   for their own customers; everything else is the house's.
 * - A customer's bonus reward is a % of the owner's share of that order's margin (their
 *   admin's share, or the house's for customers without an admin), added to their payout.
 *   The owner keeps the rest, so an admin never pays out of pocket, and the house never
 *   pays an admin's reward. Customers see only the amount ("Bonus reward"), never the %.
 * All of it is fixed when the quote is made, so the customer sees the exact payout.
 */
export interface Split {
  adminId: string | null;
  adminSharePercent: string | null;
  adminShare: string | null; // the admin's share of the margin, before the reward
  rewardPercent: string | null;
  reward: string; // added to the payout
}

export function splitFor(input: {
  margin: Decimal | null;
  customer: { adminId: string | null; rewardPercent: Decimal | string | number };
  admin: { id: string; profitPercent: Decimal | string | number; status: string; role: string } | null;
}): Split {
  const pool = input.margin && input.margin.gt(0) ? input.margin : new Decimal(0);
  const admin = input.admin && input.admin.status === "ACTIVE" && input.admin.role === "ADMIN" && input.admin.id === input.customer.adminId ? input.admin : null;
  const sharePct = admin ? D(admin.profitPercent) : null;
  const adminShare = sharePct ? rupees(pool.mul(sharePct).div(100)) : null;
  // The reward is a % of the owner's share: the admin's, or the house's (the whole pool).
  const funds = adminShare ?? pool;
  const rewardPct = D(input.customer.rewardPercent);
  const reward = rewardPct.gt(0) ? rupees(funds.mul(rewardPct).div(100)) : new Decimal(0);
  return {
    adminId: admin?.id ?? null,
    adminSharePercent: sharePct?.toString() ?? null,
    adminShare: adminShare?.toFixed(2) ?? null,
    rewardPercent: rewardPct.gt(0) ? rewardPct.toString() : null,
    reward: reward.toFixed(2),
  };
}

/**
 * The bonus reward per USDT at today's rate, for the sell form's estimate (the quote
 * fixes the exact amount). "0" when the customer has none or there's no margin.
 */
export async function rewardPerUsdt(user: { adminId: string | null; rewardPercent: Decimal | string | number }, s: { rate: string; marketRate: string | null }): Promise<string> {
  const pct = D(user.rewardPercent);
  if (pct.lte(0) || !s.marketRate) return "0";
  const pool = Decimal.max(D(s.marketRate).minus(D(s.rate)), 0);
  const admin = user.adminId ? await prisma.admin.findUnique({ where: { id: user.adminId }, select: { profitPercent: true, status: true, role: true } }) : null;
  const funds = admin && admin.status === "ACTIVE" && admin.role === "ADMIN" ? pool.mul(D(admin.profitPercent)).div(100) : pool;
  return funds.mul(pct).div(100).toString();
}

/** Called in the same transaction that marks an order paid: books the admin's earning. */
export async function recordEarning(tx: Tx, orderId: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { adminId: true, adminShare: true, adminSharePercent: true, reward: true, margin: true } });
  if (!o.adminId || o.adminShare === null || o.adminSharePercent === null) return null;
  const share = D(o.adminShare);
  const amount = Decimal.max(share.minus(D(o.reward)), 0);
  return tx.adminEarning.create({
    data: {
      adminId: o.adminId,
      orderId,
      margin: D(o.margin ?? 0).toFixed(2),
      sharePercent: o.adminSharePercent,
      share: share.toFixed(2),
      reward: D(o.reward).toFixed(2),
      amount: amount.toFixed(2),
    },
  });
}

export interface EarningTotals {
  pending: Decimal;
  settled: Decimal;
  pendingCount: number;
  rewards: Decimal;
}

export async function earningTotals(where: Prisma.AdminEarningWhereInput = {}): Promise<Map<string, EarningTotals>> {
  const rows = await prisma.adminEarning.groupBy({ by: ["adminId", "status"], where: { ...where, status: { not: "VOID" } }, _sum: { amount: true, reward: true }, _count: { _all: true } });
  const out = new Map<string, EarningTotals>();
  for (const r of rows) {
    const t = out.get(r.adminId) ?? { pending: new Decimal(0), settled: new Decimal(0), pendingCount: 0, rewards: new Decimal(0) };
    const amt = D(r._sum.amount ?? 0);
    if (r.status === "PENDING") {
      t.pending = t.pending.plus(amt);
      t.pendingCount += r._count._all;
    } else t.settled = t.settled.plus(amt);
    t.rewards = t.rewards.plus(D(r._sum.reward ?? 0));
    out.set(r.adminId, t);
  }
  return out;
}

/** Super admin paid an admin everything pending: one settlement, every pending row marked settled. */
export async function settleAdmin(adminId: string, input: { reference?: string; note?: string; expectedAmount?: string }, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    // Lock the admin's pending rows so two clicks can't settle the same earnings twice.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settle:${adminId}`}))`;
    const rows = await tx.adminEarning.findMany({ where: { adminId, status: "PENDING" }, select: { id: true, amount: true } });
    if (rows.length === 0) throw new AppError("Nothing pending for this admin.");
    const amount = rows.reduce((s, r) => s.plus(D(r.amount)), new Decimal(0));
    // The amount shown on screen must still be the amount settled (a new order may have been paid since).
    if (input.expectedAmount && !amount.eq(D(input.expectedAmount))) throw new AppError(`The pending amount changed to ₹${amount.toFixed(2)}. Check and try again.`, 409);
    const st = await tx.adminSettlement.create({
      data: { adminId, amount: amount.toFixed(2), count: rows.length, reference: input.reference?.trim() || null, note: input.note?.trim() || null, createdBy: actor.id ?? "system" },
    });
    await tx.adminEarning.updateMany({ where: { id: { in: rows.map((r) => r.id) }, status: "PENDING" }, data: { status: "SETTLED", settlementId: st.id } });
    await audit(actor, "ADMIN_EARNINGS_SETTLED", { targetType: "admin", targetId: adminId, details: { settlementId: st.id, amount: amount.toFixed(2), count: rows.length, reference: st.reference } }, tx);
    return st;
  });
}

/** Super admin cancels one pending earning (e.g. the order turned out to be fraud). */
export async function voidEarning(id: string, reason: string, actor: Actor) {
  if (reason.trim().length < 5) throw new AppError("Write why this earning is cancelled.");
  const res = await prisma.adminEarning.updateMany({ where: { id, status: "PENDING" }, data: { status: "VOID", voidReason: reason.trim(), voidedBy: actor.id } });
  if (res.count !== 1) throw new AppError("Only a pending earning can be cancelled.");
  await audit(actor, "ADMIN_EARNING_VOIDED", { targetType: "admin_earning", targetId: id, details: { reason: reason.trim() } });
}

/** A bonus reward is a % of the owner's share, so 100% gives the customer the whole share. */
export const MAX_REWARD_PERCENT = 100;

/** Admin (own customers) or super admin (anyone) sets a customer's reward on future orders. */
export async function setReward(viewer: Viewer, actor: Actor, userId: string, percentInput: unknown, ip?: string | null) {
  await assertUser(viewer, userId);
  const v = String(percentInput ?? "").trim() || "0";
  if (!/^\d+(\.\d{1,4})?$/.test(v)) throw new AppError("Reward: a percentage like 20, or 0 for none.");
  if (D(v).gt(MAX_REWARD_PERCENT)) throw new AppError(`Reward: at most ${MAX_REWARD_PERCENT}%.`);
  const old = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { rewardPercent: true } });
  if (D(old.rewardPercent).eq(D(v))) return;
  await prisma.user.update({ where: { id: userId }, data: { rewardPercent: v } });
  await audit(actor, "CUSTOMER_REWARD_CHANGED", { targetType: "user", targetId: userId, details: { old: old.rewardPercent.toString(), new: v }, ip });
}
