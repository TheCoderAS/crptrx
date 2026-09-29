import type { Prisma } from "@prisma/client";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { istDayStart, istMonthStart } from "@/lib/time";
import type { Actor } from "../audit";
import { prisma, type Tx } from "../db";
import { getActiveDepositAddress } from "../deposit";
import { AppError } from "../errors";
import { calculatePayout, D, Decimal, usdtForNetRupees } from "../money";
import { payoutSnapshot } from "../payouts";
import { notReadyMessage, onboardingState } from "../onboarding";
import { getSettings, rateIsStale, tokenContractFor, type Settings } from "../settings";
import { OPEN_QUOTE_STATUSES, transition } from "./stateMachine";

export const QUOTE_TTL_MS = 15 * 60 * 1000;
/** Payments up to 24 h after a quote expires are still matched to it (and held as late). */
export const LATE_PAYMENT_WINDOW_MS = 24 * 3600_000;
export const HIGH_DEMAND = "High demand, please try again in a few minutes.";

export interface QuoteRequest {
  userId: string;
  network: NetworkCode;
  amountType: "USDT" | "INR";
  amount: string;
  payoutMethodId: string;
}

/** Totals used by limit checks (spec 7.4). Counts orders not EXPIRED or CLOSED_MANUAL. */
export async function usedTotals(tx: Tx, userId: string, now = new Date(), excludeOrderId?: string) {
  const counted = { notIn: ["EXPIRED", "CLOSED_MANUAL"] as const } as Prisma.EnumOrderStatusFilter;
  const exclude = excludeOrderId ? { id: { not: excludeOrderId } } : {};
  const sum = async (where: Prisma.OrderWhereInput) =>
    D((await tx.order.aggregate({ _sum: { usdtAmount: true }, where: { ...where, ...exclude, status: counted } }))._sum.usdtAmount ?? 0);
  const [userDay, userMonth, platformDay] = await Promise.all([
    sum({ userId, createdAt: { gte: istDayStart(now) } }),
    sum({ userId, createdAt: { gte: istMonthStart(now) } }),
    sum({ createdAt: { gte: istDayStart(now) } }),
  ]);
  return { userDay, userMonth, platformDay };
}

/** Returns a user-facing reason when `amount` would break a limit, else null. */
export async function limitProblem(tx: Tx, s: Settings, userId: string, amount: Decimal, excludeOrderId?: string): Promise<string | null> {
  // Per-order min/max apply to the amount asked for; the unique 0.01–0.99 suffix
  // added on top may take the exact amount up to 0.99 above the maximum.
  if (amount.lt(D(s.limit_min_order_usdt))) return `The minimum order is ${s.limit_min_order_usdt} USDT.`;
  if (amount.gt(D(s.limit_max_order_usdt).plus("0.99"))) return `The maximum order is ${s.limit_max_order_usdt} USDT.`;
  const t = await usedTotals(tx, userId, new Date(), excludeOrderId);
  if (t.userDay.plus(amount).gt(D(s.limit_user_daily_usdt)))
    return `This would take you over your daily limit of ${s.limit_user_daily_usdt} USDT.`;
  if (t.userMonth.plus(amount).gt(D(s.limit_user_monthly_usdt)))
    return `This would take you over your monthly limit of ${s.limit_user_monthly_usdt} USDT.`;
  if (t.platformDay.plus(amount).gt(D(s.limit_platform_daily_usdt)))
    return "We've reached today's total limit. Please try again tomorrow.";
  return null;
}

/** Pick a free 0.01–0.99 suffix so no two open orders on this network + address share an amount (spec 7.2). */
export async function pickUniqueAmount(tx: Tx, network: NetworkCode, depositAddress: string, base: Decimal, rand = Math.random): Promise<Decimal | null> {
  const lo = base.plus("0.01");
  const hi = base.plus("0.99");
  const taken = await tx.order.findMany({
    where: {
      network,
      depositAddress,
      usdtAmount: { gte: lo.toString(), lte: hi.toString() },
      // Expired quotes keep their amount for 24 h: a late payment must never land on someone else's new order.
      OR: [{ status: { in: OPEN_QUOTE_STATUSES } }, { status: "EXPIRED", quoteExpiresAt: { gte: new Date(Date.now() - LATE_PAYMENT_WINDOW_MS) } }],
    },
    select: { usdtAmount: true },
  });
  const takenSet = new Set(taken.map((o) => D(o.usdtAmount).toFixed(2)));
  const free: Decimal[] = [];
  for (let i = 1; i <= 99; i++) {
    const cand = base.plus(new Decimal(i).div(100));
    if (!takenSet.has(cand.toFixed(2))) free.push(cand);
  }
  if (free.length === 0) return null;
  return free[Math.floor(rand() * free.length)];
}

export async function nextOrderId(tx: Tx, now = new Date()): Promise<{ id: string; seq: number }> {
  const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval(pg_get_serial_sequence('orders', 'seq'))`;
  const seq = Number(nextval);
  return { id: `ORD-${now.getUTCFullYear()}-${String(seq).padStart(6, "0")}`, seq };
}

export async function assertCanCreateOrders(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") throw new AppError("Your account can't place orders. Please contact support.", 403);
  const o = await onboardingState(user, undefined, tx);
  if (!o.ready) throw new AppError(notReadyMessage(o), 403);
  return user;
}

/** Validates settings and returns the base USDT amount (2 decimals) for a request. */
export function baseAmountFor(req: Pick<QuoteRequest, "amountType" | "amount">, s: Settings): Decimal {
  const raw = req.amount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new AppError("Enter an amount with up to 2 decimals.");
  const base =
    req.amountType === "INR"
      ? usdtForNetRupees(raw, { rate: s.rate, taxPercent: s.tax_percent, feePercent: s.fee_percent, gstEnabled: s.gst_enabled, gstPercent: s.gst_percent })
      : D(raw);
  if (base.lte(0)) throw new AppError("Enter an amount above zero.");
  return base;
}

export async function createQuote(req: QuoteRequest, actor: Actor, now = new Date()) {
  const s = await getSettings();
  const info = NETWORK_INFO[req.network];
  if (!info) throw new AppError("Please choose a network.");
  if (!s.network_enabled[req.network])
    throw new AppError(`${info.name} is paused right now. Please try the other network or come back later.`);
  if (rateIsStale(s, now)) throw new AppError("Our rate is being updated. Please try again shortly.");
  const depositAddress = await getActiveDepositAddress(req.network, s.network_mode);
  const tokenContract = tokenContractFor(s, req.network);
  if (!depositAddress || !tokenContract) throw new AppError(`${info.name} isn't available yet.`);
  const base = baseAmountFor(req, s);
  if (base.lt(D(s.limit_min_order_usdt))) throw new AppError(`The minimum order is ${s.limit_min_order_usdt} USDT.`, 422, "LIMIT");
  if (base.gt(D(s.limit_max_order_usdt))) throw new AppError(`The maximum order is ${s.limit_max_order_usdt} USDT.`, 422, "LIMIT");

  return prisma.$transaction(
    async (tx) => {
      // One quote at a time platform-wide: keeps unique amounts and limits race-free.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('create-quote'))`;
      await assertCanCreateOrders(tx, req.userId);
      if (s.wallet_registration === "REQUIRED" && (await tx.userWallet.count({ where: { userId: req.userId, network: req.network, deletedAt: null } })) === 0)
        throw new AppError(`Add the ${info.name} wallet you'll send from (Account → Your wallets) before selling on this network.`, 403, "WALLET_REQUIRED");
      const pm = await tx.payoutMethod.findFirst({ where: { id: req.payoutMethodId, userId: req.userId, status: "APPROVED", deletedAt: null } });
      if (!pm) throw new AppError("Choose an approved payout method.");

      const amount = await pickUniqueAmount(tx, req.network, depositAddress, base);
      if (!amount) throw new AppError(HIGH_DEMAND, 409, "HIGH_DEMAND");
      const problem = await limitProblem(tx, s, req.userId, amount);
      if (problem) throw new AppError(problem, 422, "LIMIT");

      const p = calculatePayout({ usdt: amount, rate: s.rate, taxPercent: s.tax_percent, feePercent: s.fee_percent, gstEnabled: s.gst_enabled, gstPercent: s.gst_percent });
      if (p.net.lte(0)) throw new AppError("This amount is too small to pay out.");
      const { id, seq } = await nextOrderId(tx, now);
      await tx.order.create({
        data: {
          id,
          seq,
          userId: req.userId,
          status: "QUOTE_READY",
          network: req.network,
          networkMode: s.network_mode,
          depositAddress,
          tokenContract,
          usdtAmount: amount.toString(),
          rate: s.rate,
          gross: p.gross.toString(),
          taxPercent: s.tax_percent,
          taxHeld: p.taxHeld.toString(),
          feePercent: s.fee_percent,
          fee: p.fee.toString(),
          gstPercent: s.gst_enabled ? s.gst_percent : "0",
          gstOnFee: p.gstOnFee.toString(),
          net: p.net.toString(),
          payoutMethodId: pm.id,
          payoutSnapshot: payoutSnapshot(pm),
          quoteExpiresAt: new Date(now.getTime() + QUOTE_TTL_MS),
          createdAt: now,
        },
      });
      await tx.orderEvent.create({
        data: { orderId: id, fromStatus: null, toStatus: "QUOTE_READY", actorType: actor.type, actorId: actor.id, publicMessage: "Quote created" },
      });
      return tx.order.findUniqueOrThrow({ where: { id } });
    },
    { timeout: 15_000 },
  );
}

/** How long after the quote expires we keep looking for a submitted TxID before holding the order. */
export const TXID_GRACE_MS = 2 * 3600_000;

/**
 * Spec 8.4: move QUOTE_READY orders past expiry to EXPIRED. Orders whose
 * submitted TxID still can't be found 2 hours after expiry go on hold, so
 * they don't sit open forever and keep their amount reserved.
 * Returns the ids that changed.
 */
export async function expireQuotes(now = new Date()): Promise<string[]> {
  const { HOLD } = await import("../matching");
  const stuck = await prisma.order.findMany({ where: { status: "PAYMENT_SUBMITTED", quoteExpiresAt: { lt: new Date(now.getTime() - TXID_GRACE_MS) } }, select: { id: true } });
  const changed: string[] = [];
  for (const o of stuck) {
    try {
      await prisma.$transaction((tx) =>
        transition(tx, o.id, "ON_HOLD", { type: "SYSTEM", id: null }, { from: "PAYMENT_SUBMITTED", publicMessage: HOLD.TXID_NOT_FOUND, data: { holdReason: HOLD.TXID_NOT_FOUND } }),
      );
      changed.push(o.id);
    } catch {
      /* matched in the meantime */
    }
  }
  return [...changed, ...(await expireOpenQuotes(now))];
}

async function expireOpenQuotes(now: Date): Promise<string[]> {
  const due = await prisma.order.findMany({ where: { status: "QUOTE_READY", quoteExpiresAt: { lt: now } }, select: { id: true } });
  const done: string[] = [];
  for (const o of due) {
    try {
      await prisma.$transaction((tx) =>
        transition(tx, o.id, "EXPIRED", { type: "SYSTEM", id: null }, { from: "QUOTE_READY", publicMessage: "No payment received in time." }),
      );
      done.push(o.id);
    } catch {
      /* moved by the watcher in the meantime */
    }
  }
  return done;
}
