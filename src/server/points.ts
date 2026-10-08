import type { OrderStatus, Prisma } from "@prisma/client";
import { audit, type Actor } from "./audit";
import { decrypt } from "./crypto";
import { prisma, type Tx } from "./db";
import { AppError } from "./errors";
import { D, Decimal } from "./money";
import { getSettings, type Settings } from "./settings";

/**
 * Referral points (user to user). Agreed with the owner:
 * - A user earns points only when a friend who signed up with their code sells USDT
 *   (when that sale is paid). The super admin chooses first sale only or every sale,
 *   and how many points per USDT, with a cap per sale and a smallest sale that counts.
 * - 1 point = ₹1. Points can only be used on the user's own sale: added to that payout.
 * - New points are pending for a few days (a super admin can cancel them), then usable
 *   until they expire. No points when the friend's details match the referrer's.
 * The house pays for points; admins' earnings are not touched.
 *
 * Spending: points are held when a quote uses them (taken from the rows that expire first),
 * spent when the order is paid, and given back if the order expires or is closed. If an
 * expired order is paid late after all, they're taken again, or removed from that payout.
 */

type Alloc = { id: string; points: number };

const lockUser = (tx: Tx, userId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`points:${userId}`}))`;
const DAY = 24 * 3600_000;

type Rules = Pick<Settings, "referral_mode" | "referral_points_per_usdt" | "referral_max_points_per_sale" | "referral_min_sale_usdt">;
type Overrides = { referralMode: string | null; referralPointsPerUsdt: Decimal.Value | null; referralMaxPoints: number | null };

/** The rules for one referrer: the Settings, with any super admin overrides for that user. */
export function rulesFor(u: Overrides, s: Rules): Rules {
  return {
    referral_mode: u.referralMode === "FIRST" || u.referralMode === "EVERY" ? u.referralMode : s.referral_mode,
    referral_points_per_usdt: u.referralPointsPerUsdt !== null ? D(u.referralPointsPerUsdt).toString() : s.referral_points_per_usdt,
    referral_max_points_per_sale: u.referralMaxPoints ?? s.referral_max_points_per_sale,
    referral_min_sale_usdt: s.referral_min_sale_usdt,
  };
}

/** Points a friend's sale earns under the current settings (0 = none). */
export function pointsForSale(usdt: Decimal.Value, s: Pick<Settings, "referral_points_per_usdt" | "referral_max_points_per_sale" | "referral_min_sale_usdt">): number {
  const u = D(usdt);
  if (u.lt(D(s.referral_min_sale_usdt || "0"))) return 0;
  const raw = u.mul(D(s.referral_points_per_usdt || "0")).floor().toNumber();
  const cap = Number(s.referral_max_points_per_sale) || 0;
  return Math.max(0, cap > 0 ? Math.min(raw, cap) : raw);
}

/** Why the friend can't earn their referrer points (same person or household), or null. */
export async function sameDetails(tx: Tx, referrerId: string, friendId: string): Promise<string | null> {
  const [a, b] = await Promise.all(
    [referrerId, friendId].map((id) =>
      tx.user.findUniqueOrThrow({
        where: { id },
        select: {
          mobile: true,
          kycSubmissions: { where: { status: "APPROVED" }, orderBy: { submittedAt: "desc" }, take: 1, select: { panEncrypted: true } },
          payoutMethods: { select: { upiId: true, accountNumberEncrypted: true, ifsc: true } },
        },
      }),
    ),
  );
  if (a.mobile && b.mobile && a.mobile === b.mobile) return "Same mobile number as the referrer";
  const pan = (u: typeof a) => (u.kycSubmissions[0] ? decrypt(u.kycSubmissions[0].panEncrypted).toUpperCase() : null);
  const pa = pan(a);
  if (pa && pa === pan(b)) return "Same PAN as the referrer";
  const keys = (u: typeof a) =>
    new Set(
      u.payoutMethods.flatMap((m) => [
        ...(m.upiId ? [`upi:${m.upiId.trim().toLowerCase()}`] : []),
        ...(m.accountNumberEncrypted ? [`acct:${(m.ifsc ?? "").toUpperCase()}:${decrypt(m.accountNumberEncrypted)}`] : []),
      ]),
    );
  const ka = keys(a);
  for (const k of keys(b)) if (ka.has(k)) return k.startsWith("upi:") ? "Same UPI ID as the referrer" : "Same bank account as the referrer";
  return null;
}

/** In the transaction that marks an order paid: gives the seller's referrer their points. */
export async function awardReferralPoints(tx: Tx, orderId: string, now = new Date()) {
  const s = await getSettings(tx);
  if (!s.referral_enabled) return null;
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { userId: true, usdtAmount: true, user: { select: { referredById: true } } } });
  const referrerId = o.user.referredById;
  if (!referrerId) return null;
  const referrer = await tx.user.findUnique({ where: { id: referrerId }, select: { status: true, referralDisabled: true, referralMode: true, referralPointsPerUsdt: true, referralMaxPoints: true } });
  // A switched-off code earns nothing more, also for friends who joined before.
  if (!referrer || referrer.status !== "ACTIVE" || referrer.referralDisabled) return null;
  const rules = rulesFor(referrer, s);
  if (rules.referral_mode === "FIRST" && (await tx.referralPoint.count({ where: { fromUserId: o.userId } })) > 0) return null;
  const points = pointsForSale(o.usdtAmount, rules);
  if (points <= 0) return null;
  const blocked = await sameDetails(tx, referrerId, o.userId);
  const availableAt = new Date(now.getTime() + Number(s.referral_hold_days) * DAY);
  const expiry = Number(s.referral_expiry_days);
  const row = await tx.referralPoint.create({
    data: {
      userId: referrerId,
      fromUserId: o.userId,
      orderId,
      usdt: D(o.usdtAmount).toString(),
      points,
      status: blocked ? "BLOCKED" : "ACTIVE",
      reason: blocked,
      availableAt,
      expiresAt: expiry > 0 ? new Date(availableAt.getTime() + expiry * DAY) : null,
    },
  });
  await audit({ type: "SYSTEM", id: null }, blocked ? "USER_POINTS_BLOCKED" : "USER_POINTS_EARNED", { targetType: "user", targetId: referrerId, details: { orderId, from: o.userId, points, reason: blocked } }, tx);
  return row;
}

export interface PointsBalance {
  /** Can be used on a sale now. */
  usable: number;
  /** Earned, waiting for the holding period. */
  pending: number;
  /** Set aside on an open order. */
  held: number;
  spent: number;
  expired: number;
  /** When the soonest pending points become usable. */
  nextReadyAt: Date | null;
}

export async function pointsBalance(userId: string, tx: Tx = prisma, now = new Date()): Promise<PointsBalance> {
  const [[p], [r]] = await Promise.all([
    tx.$queryRaw<{ usable: number; pending: number; expired: number; next: Date | null }[]>`
      SELECT
        coalesce(sum(points - used) FILTER (WHERE "availableAt" <= ${now} AND ("expiresAt" IS NULL OR "expiresAt" > ${now})), 0)::int AS usable,
        coalesce(sum(points) FILTER (WHERE "availableAt" > ${now}), 0)::int AS pending,
        coalesce(sum(points - used) FILTER (WHERE "expiresAt" <= ${now}), 0)::int AS expired,
        min("availableAt") FILTER (WHERE "availableAt" > ${now}) AS next
      FROM referral_points WHERE "userId" = ${userId} AND status = 'ACTIVE'`,
    tx.$queryRaw<{ held: number; spent: number }[]>`
      SELECT
        coalesce(sum(points) FILTER (WHERE status = 'HELD'), 0)::int AS held,
        coalesce(sum(points) FILTER (WHERE status = 'SPENT'), 0)::int AS spent
      FROM point_redemptions WHERE "userId" = ${userId}`,
  ]);
  return { usable: p.usable, pending: p.pending, held: r.held, spent: r.spent, expired: p.expired, nextReadyAt: p.next };
}

/** Takes up to `want` usable points, soonest-expiring first. Caller holds the user's lock. */
async function take(tx: Tx, userId: string, want: number, now: Date): Promise<Alloc[]> {
  if (want <= 0) return [];
  const rows = await tx.$queryRaw<{ id: string; left: number }[]>`
    SELECT id, (points - used)::int AS left FROM referral_points
    WHERE "userId" = ${userId} AND status = 'ACTIVE' AND used < points
      AND "availableAt" <= ${now} AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
    ORDER BY "expiresAt" ASC NULLS LAST, "availableAt" ASC, id ASC
    FOR UPDATE`;
  const out: Alloc[] = [];
  let need = want;
  for (const r of rows) {
    if (need <= 0) break;
    const n = Math.min(r.left, need);
    await tx.referralPoint.update({ where: { id: r.id }, data: { used: { increment: n } } });
    out.push({ id: r.id, points: n });
    need -= n;
  }
  return out;
}

const total = (a: Alloc[]) => a.reduce((n, x) => n + x.points, 0);

/** At quote time: sets aside all the user's usable points (or `max`) for this order. Returns how many. */
export async function holdPoints(tx: Tx, userId: string, orderId: string, max = Infinity, now = new Date()): Promise<number> {
  await lockUser(tx, userId);
  const b = await pointsBalance(userId, tx, now);
  const allocs = await take(tx, userId, Math.min(b.usable, max), now);
  const n = total(allocs);
  if (n > 0) await tx.pointRedemption.create({ data: { userId, orderId, points: n, allocations: allocs as unknown as Prisma.InputJsonValue } });
  return n;
}

/** Order expired or closed: held points go back where they came from. */
export async function releasePoints(tx: Tx, orderId: string) {
  const r = await tx.pointRedemption.findUnique({ where: { orderId } });
  if (!r || r.status !== "HELD") return;
  await lockUser(tx, r.userId);
  for (const a of r.allocations as unknown as Alloc[]) await tx.referralPoint.update({ where: { id: a.id }, data: { used: { decrement: a.points } } });
  await tx.pointRedemption.update({ where: { id: r.id }, data: { status: "RELEASED" } });
}

/**
 * An expired order was paid late after all: take its points again. Whatever is no longer
 * available (used or expired since) comes off this order's payout, so nothing is paid twice.
 */
export async function reholdPoints(tx: Tx, orderId: string, now = new Date()) {
  const r = await tx.pointRedemption.findUnique({ where: { orderId } });
  if (!r || r.status !== "RELEASED") return;
  await lockUser(tx, r.userId);
  const allocs = await take(tx, r.userId, r.points, now);
  const got = total(allocs);
  if (got > 0) await tx.pointRedemption.update({ where: { id: r.id }, data: { status: "HELD", points: got, allocations: allocs as unknown as Prisma.InputJsonValue } });
  const short = r.points - got;
  if (short > 0) {
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { net: true, pointsUsed: true, status: true } });
    await tx.order.update({ where: { id: orderId }, data: { net: D(o.net).minus(short).toFixed(2), pointsUsed: Math.max(0, o.pointsUsed - short) } });
    await tx.orderEvent.create({
      data: { orderId, fromStatus: o.status as OrderStatus, toStatus: o.status as OrderStatus, actorType: "SYSTEM", actorId: null, publicMessage: `₹${short} of points was no longer available and was taken off this payout.` },
    });
  }
}

/** Order paid: its held points are spent for good. */
export async function spendPoints(tx: Tx, orderId: string) {
  await tx.pointRedemption.updateMany({ where: { orderId, status: "HELD" }, data: { status: "SPENT" } });
}

/** Runs after every order status change (stateMachine.ts). */
export async function onOrderStatus(tx: Tx, orderId: string, from: OrderStatus, to: OrderStatus) {
  if (to === "EXPIRED" || to === "CLOSED_MANUAL") await releasePoints(tx, orderId);
  else if (from === "EXPIRED") await reholdPoints(tx, orderId);
  else if (to === "PAID") await spendPoints(tx, orderId);
}

/** Super admin cancels points that are still pending (fraud, a mistake). Logged. */
export async function cancelPoints(id: string, reason: unknown, actor: Actor, now = new Date()) {
  const why = String(reason ?? "").trim();
  if (why.length < 5) throw new AppError("Write why these points are cancelled.");
  const p = await prisma.referralPoint.findUnique({ where: { id }, select: { userId: true, points: true } });
  if (!p) throw new AppError("Not found", 404, "NOT_FOUND");
  const r = await prisma.referralPoint.updateMany({ where: { id, status: "ACTIVE", availableAt: { gt: now }, used: 0 }, data: { status: "CANCELLED", reason: why.slice(0, 300), cancelledBy: actor.id } });
  if (r.count !== 1) throw new AppError("Only pending points can be cancelled.");
  await audit(actor, "USER_POINTS_CANCELLED", { targetType: "user", targetId: p.userId, details: { pointsId: id, points: p.points, reason: why } });
}

/**
 * Super admin: switch one user's code off (no new sign-ups with it, no new points), or give
 * it its own reward rules. Empty fields = the Settings default. Logged.
 */
export async function setReferralRules(userId: string, input: { enabled?: unknown; mode?: unknown; pointsPerUsdt?: unknown; maxPoints?: unknown }, actor: Actor, ip?: string | null) {
  const mode = String(input.mode ?? "").trim();
  if (mode && mode !== "FIRST" && mode !== "EVERY") throw new AppError("Reward on: default, first sale or every sale.");
  const per = String(input.pointsPerUsdt ?? "").trim();
  if (per && (!/^\d+(\.\d{1,2})?$/.test(per) || D(per).gt(1000))) throw new AppError("Points per USDT: a number like 1 or 0.5 (1000 at most), or empty for the default.");
  const max = String(input.maxPoints ?? "").trim();
  if (max && (!/^\d+$/.test(max) || Number(max) > 1_000_000)) throw new AppError("Most points per sale: a whole number (0 = no limit), or empty for the default.");
  const data = {
    referralDisabled: !(input.enabled === true || input.enabled === "true" || input.enabled === "on"),
    referralMode: mode || null,
    referralPointsPerUsdt: per || null,
    referralMaxPoints: max ? Number(max) : null,
  };
  const old = await prisma.user.findUnique({ where: { id: userId }, select: { referralDisabled: true, referralMode: true, referralPointsPerUsdt: true, referralMaxPoints: true } });
  if (!old) throw new AppError("Not found", 404, "NOT_FOUND");
  await prisma.user.update({ where: { id: userId }, data });
  await audit(actor, "USER_REFERRAL_RULES_CHANGED", { targetType: "user", targetId: userId, details: { old: { ...old, referralPointsPerUsdt: old.referralPointsPerUsdt?.toString() ?? null }, new: data }, ip });
}
