import type { IncomingTransfer, Order, Prisma } from "@prisma/client";
import { txidNetwork, type NetworkCode } from "@/lib/networks";
import { audit, SYSTEM, type Actor } from "./audit";
import { prisma, type Tx } from "./db";
import { allKnownDepositAddresses } from "./deposit";
import { AppError } from "./errors";
import { D } from "./money";
import { getAdapter, type ChainTransfer } from "./networks";
import { LATE_PAYMENT_WINDOW_MS, limitProblem } from "./orders/quote";
import { transition } from "./orders/stateMachine";
import { getSettings, tokenContractFor, type Settings } from "./settings";

// Hold reasons set by the app (spec 6 and 7.3). Text is shown to users.
export const HOLD = {
  AMOUNT: "Amount doesn't match the quote.",
  LATE: "Payment arrived after the quote expired. The rate needs to be re-confirmed.",
  OTHER_NETWORK: "Payment sent on a different network than the order.",
  TXID_USED: "Transaction ID already used.",
  OVER_LIMIT: "Over your limits.",
  TX_FAILED: "The transaction failed on the blockchain.",
  NOT_TO_US: "We couldn't find a USDT payment to our address in this transaction.",
  BEFORE_QUOTE: "The payment was made before this order was created.",
  UNKNOWN_WALLET: "Sent from a wallet that isn't on your account.",
  TXID_NOT_FOUND: "We couldn't find a payment with the transaction ID you gave.",
  FROM_US: "This payment came from our own wallet, not yours. Please pay from your own wallet.",
  SAME_AMOUNT: "Another order is open for the same amount, so we're confirming this payment is yours. Our team will check it shortly.",
} as const;

/** Holds that a fresh look at the blockchain can clear (wrong settings, a slow node, a typo fixed by the user). */
export const RECHECKABLE_HOLDS: string[] = [HOLD.NOT_TO_US, HOLD.TXID_NOT_FOUND, HOLD.TX_FAILED];

export type MatchEvent = { orderId: string; kind: "CONFIRMED" | "ON_HOLD"; reason?: string };

const LATE_WINDOW_MS = LATE_PAYMENT_WINDOW_MS;

function toRow(t: ChainTransfer): Prisma.IncomingTransferCreateInput {
  return {
    network: t.network,
    txid: t.txid,
    transferPosition: t.position,
    tokenContract: t.tokenContract,
    toAddress: t.to,
    fromAddress: t.from,
    amount: t.amount.toString(),
    rawAmount: t.rawAmount.toString(),
    blockNumber: t.blockNumber,
    blockTime: t.blockTime,
    raw: JSON.parse(JSON.stringify(t.raw, (_k, v) => (typeof v === "bigint" ? v.toString() : v))),
  };
}

async function hold(tx: Tx, order: Pick<Order, "id" | "status">, reason: string, events: MatchEvent[], note?: string) {
  // Some statuses need to pass through PAYMENT_CONFIRMED first (QUOTE_READY / EXPIRED can't go straight to hold).
  let status = order.status;
  if (status === "QUOTE_READY" || status === "EXPIRED") {
    await transition(tx, order.id, "PAYMENT_CONFIRMED", SYSTEM, { from: status, publicMessage: "Payment received." });
    status = "PAYMENT_CONFIRMED";
  }
  await transition(tx, order.id, "ON_HOLD", SYSTEM, { from: status, publicMessage: reason, privateNote: note, data: { holdReason: reason, holdMessage: null } });
  events.push({ orderId: order.id, kind: "ON_HOLD", reason });
}

function linkData(t: IncomingTransfer): Prisma.OrderUpdateInput {
  return {
    txid: t.txid,
    transferPosition: t.transferPosition,
    senderAddress: t.fromAddress,
    receivedAmount: t.amount,
    confirmedAt: new Date(),
  };
}

async function linkTransfer(tx: Tx, t: IncomingTransfer, orderId: string) {
  await tx.incomingTransfer.update({ where: { id: t.id }, data: { status: "MATCHED", matchedOrderId: orderId } });
}

export async function isRegisteredWallet(tx: Tx, userId: string, network: NetworkCode, address: string): Promise<boolean> {
  const addr = getAdapter(network).normalizeAddress(address);
  return (await tx.userWallet.count({ where: { userId, network, address: addr, deletedAt: null } })) > 0;
}

/** Users who have sent from this address before, or registered it as their wallet. */
async function senderOwners(tx: Tx, t: IncomingTransfer): Promise<Set<string>> {
  const addr = getAdapter(t.network as NetworkCode).normalizeAddress(t.fromAddress);
  const [wallets, past] = await Promise.all([
    tx.userWallet.findMany({ where: { network: t.network, address: addr, deletedAt: null }, select: { userId: true } }),
    tx.order.findMany({ where: { network: t.network, senderAddress: { in: [addr, t.fromAddress] } }, select: { userId: true }, distinct: ["userId"] }),
  ]);
  return new Set([...wallets, ...past].map((r) => r.userId));
}

/**
 * Amounts are what the user typed, so several open orders can share one.
 * Pick an order only when it's certain whose payment this is: the only order
 * with that amount, the only one whose owner has sent from this wallet before,
 * or all of them belong to the same person. Otherwise null: an admin links it.
 */
async function pickOrder(tx: Tx, t: IncomingTransfer, cands: Order[]): Promise<Order | null> {
  if (cands.length <= 1) return cands[0] ?? null;
  const owners = await senderOwners(tx, t);
  const bySender = cands.filter((o) => owners.has(o.userId));
  const pool = bySender.length > 0 ? bySender : cands;
  if (new Set(pool.map((o) => o.userId)).size !== 1) return null;
  // One person's orders (newest first): their oldest open quote, else the newest expired one.
  const live = pool.filter((o) => o.status === "QUOTE_READY");
  return live[live.length - 1] ?? pool[0];
}

/** Confirm a transfer that pays `order` with the exact amount, then apply late / limit holds. */
async function confirmExact(tx: Tx, s: Settings, t: IncomingTransfer, order: Order, events: MatchEvent[]) {
  await linkTransfer(tx, t, order.id);
  await transition(tx, order.id, "PAYMENT_CONFIRMED", SYSTEM, { from: order.status, publicMessage: "Payment received.", data: linkData(t) });
  const late = order.status === "EXPIRED" || t.blockTime > order.quoteExpiresAt;
  if (late) {
    // Limits are still checked, so paying expired quotes late can't get around them.
    const over = await limitProblem(tx, s, order.userId, D(order.usdtAmount), order.id);
    await transition(tx, order.id, "ON_HOLD", SYSTEM, { from: "PAYMENT_CONFIRMED", publicMessage: HOLD.LATE, privateNote: over ? `Also over limit: ${over}` : null, data: { holdReason: HOLD.LATE } });
    events.push({ orderId: order.id, kind: "ON_HOLD", reason: HOLD.LATE });
    return;
  }
  const problem = await limitProblem(tx, s, order.userId, D(order.usdtAmount), order.id);
  if (problem) {
    await transition(tx, order.id, "ON_HOLD", SYSTEM, { from: "PAYMENT_CONFIRMED", publicMessage: HOLD.OVER_LIMIT, privateNote: problem, data: { holdReason: HOLD.OVER_LIMIT } });
    events.push({ orderId: order.id, kind: "ON_HOLD", reason: HOLD.OVER_LIMIT });
    return;
  }
  if (s.wallet_registration === "REQUIRED" && !(await isRegisteredWallet(tx, order.userId, t.network as NetworkCode, t.fromAddress))) {
    const note = `Sender ${t.fromAddress} is not a registered wallet of this user`;
    await transition(tx, order.id, "ON_HOLD", SYSTEM, { from: "PAYMENT_CONFIRMED", publicMessage: HOLD.UNKNOWN_WALLET, privateNote: note, data: { holdReason: HOLD.UNKNOWN_WALLET } });
    events.push({ orderId: order.id, kind: "ON_HOLD", reason: HOLD.UNKNOWN_WALLET });
    return;
  }
  events.push({ orderId: order.id, kind: "CONFIRMED" });
}

/**
 * Match one stored transfer (spec 7.3): by submitted TxID first, then by exact
 * amount on the same network and deposit address. Runs inside the caller's
 * transaction, which holds the matching lock.
 */
async function matchOne(tx: Tx, s: Settings, t: IncomingTransfer, events: MatchEvent[], siblings: IncomingTransfer[]) {
  const a = getAdapter(t.network as NetworkCode);
  const to = a.normalizeAddress(t.toAddress);

  // Sent from one of our own deposit addresses (e.g. paying from the company
  // wallet by mistake, or moving funds): never a customer's payment. Stays
  // unmatched for an admin, and any order claiming it is held.
  const ours = new Set((await allKnownDepositAddresses(t.network as NetworkCode)).map((x) => a.normalizeAddress(x)));
  if (ours.has(a.normalizeAddress(t.fromAddress))) {
    const claimed = await tx.order.findFirst({ where: { submittedTxid: t.txid, status: "PAYMENT_SUBMITTED" } });
    if (claimed) await hold(tx, claimed, HOLD.FROM_US, events, `Sent from our deposit address ${t.fromAddress}`);
    return;
  }

  // The order this transfer pays exactly: an open quote (or one expired within
  // 24 h) on the same network + address with exactly this amount.
  const candidates = await tx.order.findMany({
    where: {
      network: t.network,
      usdtAmount: t.amount,
      submittedTxid: null,
      txid: null,
      createdAt: { lte: t.blockTime },
      OR: [{ status: "QUOTE_READY" }, { status: "EXPIRED", quoteExpiresAt: { gte: new Date(t.blockTime.getTime() - LATE_WINDOW_MS) } }],
    },
    orderBy: { createdAt: "desc" },
  });
  const sameAddress = candidates.filter((o) => a.normalizeAddress(o.depositAddress) === to);
  const exact = await pickOrder(tx, t, sameAddress);

  // 1) An order that claimed this TxID. A claim only wins when it fits exactly,
  //    or when no other order fits: anyone can copy a TxID off the blockchain,
  //    so a wrong claim must never take a payment from the order it pays.
  const claimed = await tx.order.findFirst({ where: { submittedTxid: t.txid, status: "PAYMENT_SUBMITTED" } });
  if (claimed) {
    if (claimed.network !== t.network) {
      await hold(tx, claimed, HOLD.OTHER_NETWORK, events, `Transfer ${t.network} ${t.txid}#${t.transferPosition}`);
      if (exact) return confirmExact(tx, s, t, exact, events);
      return; // transfer stays unmatched for an admin to link by hand
    }
    if (a.normalizeAddress(claimed.depositAddress) === to) {
      const fits = t.blockTime >= claimed.createdAt && D(t.amount).eq(D(claimed.usdtAmount));
      if (fits) {
        // Another person has an open order for the same amount: a TxID is public,
        // so the claim alone doesn't prove whose payment this is. The sender does.
        const rivals = sameAddress.filter((o) => o.userId !== claimed.userId);
        if (rivals.length === 0) return confirmExact(tx, s, t, claimed, events);
        const owners = await senderOwners(tx, t);
        if (owners.has(claimed.userId)) return confirmExact(tx, s, t, claimed, events);
        const rightful = await pickOrder(tx, t, rivals.filter((o) => owners.has(o.userId)));
        if (rightful) {
          await hold(tx, claimed, HOLD.TXID_USED, events, `Claimed ${t.txid}, sent from ${t.fromAddress}, the wallet of ${rightful.id}`);
          return confirmExact(tx, s, t, rightful, events);
        }
        // Nobody can be proven: leave the transfer unmatched for an admin to link.
        await hold(tx, claimed, HOLD.SAME_AMOUNT, events, `Same amount open on ${rivals.map((o) => o.id).join(", ")}. Sender ${t.fromAddress} isn't linked to any of them. Link the transfer by hand.`);
        return;
      }
      if (sameAddress.length > 0) {
        // Pays someone else's order exactly. The claimant is held: their TxID isn't theirs.
        await hold(tx, claimed, HOLD.TXID_USED, events, `Claimed ${t.txid}, which pays ${exact?.id ?? sameAddress.map((o) => o.id).join(" or ")}`);
        if (exact) return confirmExact(tx, s, t, exact, events);
        return;
      }
      if (t.blockTime < claimed.createdAt) {
        await linkTransfer(tx, t, claimed.id);
        await hold(tx, claimed, HOLD.BEFORE_QUOTE, events);
        return;
      }
      // Wrong amount. If another transfer in the same tx pays it exactly, let that one match instead.
      const exactSibling = siblings.some((x) => x.id !== t.id && a.normalizeAddress(x.toAddress) === to && D(x.amount).eq(D(claimed.usdtAmount)));
      if (!exactSibling) {
        await linkTransfer(tx, t, claimed.id);
        await tx.order.update({ where: { id: claimed.id }, data: linkData(t) });
        await hold(tx, claimed, HOLD.AMOUNT, events, `Expected ${claimed.usdtAmount} received ${t.amount}`);
        return;
      }
    }
  }

  // 2) Exact amount.
  if (exact) return confirmExact(tx, s, t, exact, events);
  // 3) No match: stays UNMATCHED for the admin list.
}

export interface IngestOptions {
  /** false = store only (e.g. a transfer the user claimed for an order on the other network). */
  autoMatch?: boolean;
}

/**
 * Save transfers (idempotent on network + txid + position) and match the new
 * ones. Transfers must already be verified successful and final by the
 * network adapter. Wrong-token transfers are stored as ignored and logged.
 */
export async function ingestTransfers(transfers: ChainTransfer[], opts: IngestOptions = {}): Promise<MatchEvent[]> {
  if (transfers.length === 0) return [];
  const s = await getSettings();
  const events: MatchEvent[] = [];
  // Group by transaction so batched transfers are matched together.
  const byTx = new Map<string, ChainTransfer[]>();
  for (const t of transfers) byTx.set(`${t.network}:${t.txid}`, [...(byTx.get(`${t.network}:${t.txid}`) ?? []), t]);

  for (const group of byTx.values()) {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('match-transfers'))`;
        const fresh: IncomingTransfer[] = [];
        for (const t of group) {
          const a = getAdapter(t.network);
          const official = tokenContractFor(s, t.network);
          const wrongToken = !official || a.normalizeAddress(t.tokenContract) !== a.normalizeAddress(official);
          const exists = await tx.incomingTransfer.findUnique({
            where: { network_txid_transferPosition: { network: t.network, txid: t.txid, transferPosition: t.position } },
          });
          if (exists) {
            // Ignored as the wrong token earlier, but the token setting has since been
            // corrected (e.g. a test token registered late): give it a fresh match.
            if (exists.status === "IGNORED_WRONG_TOKEN" && !wrongToken) {
              fresh.push(await tx.incomingTransfer.update({ where: { id: exists.id }, data: { status: "UNMATCHED" } }));
            }
            continue;
          }
          const row = await tx.incomingTransfer.create({ data: { ...toRow(t), status: wrongToken ? "IGNORED_WRONG_TOKEN" : "UNMATCHED" } });
          if (wrongToken) {
            await audit(SYSTEM, "IGNORED_WRONG_TOKEN_TRANSFER", {
              targetType: "incoming_transfer",
              targetId: row.id,
              details: { network: t.network, txid: t.txid, token: t.tokenContract, amount: t.amount.toString() },
            }, tx);
            continue;
          }
          fresh.push(row);
        }
        if (opts.autoMatch === false) return;
        const all = await tx.incomingTransfer.findMany({ where: { network: group[0].network, txid: group[0].txid, status: { not: "IGNORED_WRONG_TOKEN" } } });
        for (const row of fresh) {
          const current = await tx.incomingTransfer.findUniqueOrThrow({ where: { id: row.id } });
          if (current.status === "UNMATCHED") await matchOne(tx, s, current, events, all);
        }
      },
      { timeout: 20_000 },
    );
  }
  return events;
}

/**
 * Called for PAYMENT_SUBMITTED orders: look the claimed TxID up on chain and
 * resolve it. Returns events for notifications. Safe to call repeatedly.
 */
export async function verifySubmittedTxid(orderId: string): Promise<MatchEvent[]> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PAYMENT_SUBMITTED" || !order.submittedTxid) return [];
  const s = await getSettings();
  const events: MatchEvent[] = [];
  const claimedNet = txidNetwork(order.submittedTxid);

  if (claimedNet && claimedNet !== order.network) {
    // Different network: hold now; store the transfer (if we can see it) for manual linking.
    await prisma.$transaction((tx) => hold(tx, order, HOLD.OTHER_NETWORK, events, `User submitted a ${claimedNet} TxID`));
    // Best effort, not awaited: admins can still find it from the TxID shown on the order.
    void storeOtherNetworkTransfers(claimedNet, order.submittedTxid, s).catch(() => undefined);
    return events;
  }

  const net = order.network as NetworkCode;
  const a = getAdapter(net);
  const ctx = networkContext(s, net);
  const lookup = await a.lookupTx(order.submittedTxid, ctx);
  if (!lookup.found || !lookup.final) return []; // try again next pass
  if (!lookup.success) {
    await prisma.$transaction((tx) => hold(tx, order, HOLD.TX_FAILED, events));
    return events;
  }
  const known = new Set(await allKnownDepositAddresses(net));
  const ours = lookup.transfers.filter((t) => known.has(a.normalizeAddress(t.to)));
  const official = tokenContractFor(s, net);
  const officialToUs = ours.filter((t) => a.normalizeAddress(t.tokenContract) === a.normalizeAddress(official));

  // Transfers we already stored (e.g. seen by the watcher first).
  const existing = await prisma.incomingTransfer.findMany({ where: { network: net, txid: a.normalizeTxid(order.submittedTxid) } });
  const toOrderAddr = existing.filter((e) => e.status !== "IGNORED_WRONG_TOKEN" && a.normalizeAddress(e.toAddress) === a.normalizeAddress(order.depositAddress));
  if (toOrderAddr.length > 0 && toOrderAddr.every((e) => e.status === "MATCHED" && e.matchedOrderId !== order.id)) {
    await prisma.$transaction((tx) => hold(tx, order, HOLD.TXID_USED, events));
    return events;
  }
  const unmatchedMine = toOrderAddr.filter((e) => e.status === "UNMATCHED");
  if (unmatchedMine.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('match-transfers'))`;
      const all = await tx.incomingTransfer.findMany({ where: { network: net, txid: unmatchedMine[0].txid } });
      const sorted = [...unmatchedMine].sort((x, y) => Number(D(y.amount).eq(D(order.usdtAmount))) - Number(D(x.amount).eq(D(order.usdtAmount))));
      for (const row of sorted) {
        const fresh = await tx.incomingTransfer.findUniqueOrThrow({ where: { id: row.id } });
        if (fresh.status === "UNMATCHED") await matchOne(tx, s, fresh, events, all);
      }
    });
    return events;
  }

  if (officialToUs.length === 0) {
    if (ours.length > 0) await ingestTransfers(ours, { autoMatch: false }); // logs wrong-token transfers
    await prisma.$transaction((tx) => hold(tx, order, HOLD.NOT_TO_US, events));
    return events;
  }
  return [...events, ...(await ingestTransfers(ours))];
}

/**
 * "Re-check payment": look the order's TxID up on the blockchain again. Clears
 * holds a fresh look can fix (a token setting corrected, a slow node), and runs
 * the normal checks again, so it can't confirm anything matching wouldn't.
 */
export async function recheckPayment(orderId: string, actor: Actor, userId?: string): Promise<MatchEvent[]> {
  const o = await prisma.order.findUnique({ where: { id: orderId } });
  if (!o || (userId && o.userId !== userId)) throw new AppError("Order not found", 404);
  if (!o.submittedTxid) throw new AppError("Add the transaction ID of your payment first, then we can check it.", 409);
  if (o.status === "ON_HOLD") {
    if (!RECHECKABLE_HOLDS.includes(o.holdReason ?? "")) throw new AppError("This one needs our team to look at it. We'll update you here.", 409);
    await prisma.$transaction((tx) =>
      transition(tx, o.id, "PAYMENT_SUBMITTED", actor, { from: "ON_HOLD", publicMessage: "Checking the payment again.", data: { holdReason: null, holdMessage: null } }),
    );
  } else if (o.status !== "PAYMENT_SUBMITTED") {
    throw new AppError("This payment has already been checked.", 409);
  }
  return verifySubmittedTxid(o.id);
}

async function storeOtherNetworkTransfers(net: NetworkCode, txid: string, s: Settings) {
  const a = getAdapter(net);
  const lookup = await a.lookupTx(a.normalizeTxid(txid), networkContext(s, net));
  if (!lookup.found || !lookup.final || !lookup.success) return;
  const known = new Set(await allKnownDepositAddresses(net));
  await ingestTransfers(lookup.transfers.filter((t) => known.has(a.normalizeAddress(t.to))), { autoMatch: false });
}

export function networkContext(s: Settings, n: NetworkCode) {
  return {
    mode: s.network_mode,
    tokenContract: tokenContractFor(s, n),
    finalityFallbackBlocks: s.bsc_finality_fallback_blocks,
    scanRange: s.bsc_scan_range,
    initialLookback: n === "BSC" ? s.bsc_initial_lookback_blocks : s.tron_initial_lookback_seconds,
  };
}
