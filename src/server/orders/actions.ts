import type { OrderStatus } from "@prisma/client";
import { txidNetwork } from "@/lib/networks";
import { audit, type Actor } from "../audit";
import { prisma } from "../db";
import { AppError } from "../errors";
import { D } from "../money";
import { getAdapter } from "../networks";
import { transition } from "./stateMachine";

export const UTR_RE = /^[A-Za-z0-9]{12,22}$/;

async function load(orderId: string) {
  const o = await prisma.order.findUnique({ where: { id: orderId } });
  if (!o) throw new AppError("Order not found", 404);
  return o;
}

/** User pastes the TxID and taps "I've sent it" (spec 4.4 step 8). */
export async function submitTxid(orderId: string, userId: string, txidInput: string, actor: Actor) {
  const o = await load(orderId);
  if (o.userId !== userId) throw new AppError("Order not found", 404);
  const net = txidNetwork(txidInput);
  if (!net) throw new AppError("That doesn't look like a transaction ID. Copy it from your wallet or exchange.");
  const txid = getAdapter(net).normalizeTxid(txidInput);
  const dup = await prisma.order.findFirst({ where: { submittedTxid: txid, id: { not: orderId } }, select: { id: true } });
  if (dup) throw new AppError("This transaction ID was already submitted for another order.", 409, "TXID_USED");
  if (o.status !== "QUOTE_READY") throw new AppError("This order is no longer waiting for a transaction ID.", 409);
  try {
    await prisma.$transaction((tx) =>
      transition(tx, orderId, "PAYMENT_SUBMITTED", actor, { from: "QUOTE_READY", publicMessage: "Transaction ID received.", data: { submittedTxid: txid } }),
    );
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new AppError("This transaction ID was already submitted for another order.", 409, "TXID_USED");
    throw e;
  }
}

export async function startReview(orderId: string, actor: Actor) {
  await prisma.$transaction((tx) => transition(tx, orderId, "UNDER_REVIEW", actor, { from: "PAYMENT_CONFIRMED", publicMessage: "Review started." }));
}

export async function putOnHold(orderId: string, input: { reason: string; message?: string; note?: string }, actor: Actor) {
  if (!input.reason?.trim()) throw new AppError("Choose a hold reason.");
  const o = await load(orderId);
  await prisma.$transaction((tx) =>
    transition(tx, orderId, "ON_HOLD", actor, {
      from: o.status,
      publicMessage: [input.reason.trim(), input.message?.trim()].filter(Boolean).join(" "),
      privateNote: input.note?.trim() || null,
      data: { holdReason: input.reason.trim(), holdMessage: input.message?.trim() || null },
    }),
  );
}

export async function releaseHold(orderId: string, note: string | undefined, actor: Actor) {
  await prisma.$transaction((tx) =>
    transition(tx, orderId, "UNDER_REVIEW", actor, { from: "ON_HOLD", publicMessage: "Hold released. Review continues.", privateNote: note ?? null, data: { holdReason: null, holdMessage: null } }),
  );
}

export async function saveWalletCheck(orderId: string, input: { result: string; note: string }, actor: Actor) {
  if (input.result !== "CLEAN" && input.result !== "SUSPICIOUS") throw new AppError("Choose Clean or Suspicious.");
  // The note is optional; a Suspicious result needs one so the next admin knows why.
  const note = input.note?.trim() || null;
  if (input.result === "SUSPICIOUS" && !note) throw new AppError("Write what looked suspicious.");
  const o = await load(orderId);
  if (["PAID", "CLOSED_MANUAL"].includes(o.status)) throw new AppError("This order is closed.");
  await prisma.order.update({ where: { id: orderId }, data: { walletCheckResult: input.result, walletCheckNote: note, walletCheckedBy: actor.id } });
  await audit(actor, "WALLET_CHECK_SAVED", { targetType: "order", targetId: orderId, details: { result: input.result } });
}

/** Why paying this order out would not match what we received, or null when it's clean. */
export function paymentProblem(o: { txid: string | null; receivedAmount: unknown; usdtAmount: unknown }): string | null {
  if (!o.txid) return "No blockchain payment is linked to this order.";
  if (o.receivedAmount == null || !D(String(o.receivedAmount)).eq(D(String(o.usdtAmount))))
    return `We received ${o.receivedAmount ?? 0} USDT, not the ${o.usdtAmount} USDT quoted.`;
  return null;
}

export async function approveOrder(orderId: string, actor: Actor, overrideNote?: string) {
  const o = await load(orderId);
  if (o.walletCheckResult === "SUSPICIOUS") throw new AppError("The wallet check says Suspicious. Put the order on hold instead.", 422);
  // The payout is fixed to the quoted amount, so only approve when that's what arrived,
  // unless an admin writes down why (e.g. the customer topped up in a second transfer).
  const problem = paymentProblem(o);
  const note = overrideNote?.trim();
  if (problem && (!note || note.length < 10)) throw new AppError(`${problem} To approve anyway, write why in the override note.`, 422, "PAYMENT_MISMATCH");
  // The wallet check is optional: without one, the wallet counts as clean (recorded as such).
  const walletDefault = !o.walletCheckResult;
  await prisma.$transaction((tx) =>
    transition(tx, orderId, "APPROVED", actor, {
      from: "UNDER_REVIEW",
      publicMessage: "Approved. Payment is being sent.",
      privateNote: problem ? `Approved despite: ${problem} Reason: ${note}` : null,
      data: walletDefault ? { walletCheckResult: "CLEAN", walletCheckNote: null, walletCheckedBy: actor.id } : undefined,
    }),
  );
  if (walletDefault) await audit(actor, "WALLET_CHECK_DEFAULTED", { targetType: "order", targetId: orderId, details: { result: "CLEAN" } });
  if (problem) await audit(actor, "ORDER_APPROVED_OVERRIDE", { targetType: "order", targetId: orderId, details: { problem, note: note ?? null } });
}

/** Requires the caller to have re-checked the admin's 2FA code (spec 10.4). */
export async function markPaid(orderId: string, input: { utr?: string; amount: string; paidAt: string }, actor: Actor) {
  const o = await load(orderId);
  // UTR is optional: some payouts get stuck at the bank and get no reference for a while.
  const utr = (input.utr ?? "").replace(/\s+/g, "").toUpperCase() || null;
  if (utr && !UTR_RE.test(utr)) throw new AppError("UTR must be 12 to 22 letters or numbers.");
  if (!/^\d+(\.\d{1,2})?$/.test((input.amount ?? "").trim())) throw new AppError("Enter the amount paid, e.g. 8765.43");
  if (!D(input.amount.trim()).eq(D(o.net))) throw new AppError(`The amount paid must equal the order's net amount exactly (${D(o.net).toFixed(2)}).`, 422, "AMOUNT_MISMATCH");
  const paidAt = new Date(input.paidAt);
  if (isNaN(paidAt.getTime())) throw new AppError("Enter the date and time paid.");
  if (paidAt.getTime() > Date.now() + 5 * 60_000) throw new AppError("Paid time can't be in the future.");
  const dupUtr = utr ? await prisma.order.findFirst({ where: { utr, id: { not: orderId } }, select: { id: true } }) : null;
  if (dupUtr) throw new AppError(`This UTR is already recorded on ${dupUtr.id}.`, 409);
  try {
    await prisma.$transaction((tx) =>
      transition(tx, orderId, "PAID", actor, {
        from: "APPROVED",
        publicMessage: utr ? `Paid. Bank reference ${utr}.` : "Paid.",
        data: { utr, paidAmount: D(o.net).toFixed(2), paidAt, paidByAdminId: actor.id },
      }),
    );
  } catch (e) {
    // Unique index on utr: two admins entering the same UTR at the same moment.
    if ((e as { code?: string }).code === "P2002") throw new AppError("This UTR is already recorded on another order.", 409);
    throw e;
  }
}

export async function closeManual(orderId: string, input: { resolutionNote: string; returnTxid?: string }, actor: Actor) {
  if (!input.resolutionNote?.trim()) throw new AppError("Write how this was resolved.");
  const returnTxid = input.returnTxid?.trim() || null;
  if (returnTxid && !txidNetwork(returnTxid)) throw new AppError("The return TxID doesn't look valid.");
  await prisma.$transaction((tx) =>
    transition(tx, orderId, "CLOSED_MANUAL", actor, {
      from: "ON_HOLD",
      publicMessage: "Closed. Our team has contacted you about this order.",
      privateNote: input.resolutionNote.trim(),
      data: { resolutionNote: input.resolutionNote.trim(), returnTxid },
    }),
  );
}

export async function addNote(orderId: string, note: string, actor: Actor) {
  if (!note?.trim()) throw new AppError("Write a note.");
  await load(orderId);
  await prisma.adminNote.create({ data: { orderId, adminId: actor.id!, note: note.trim() } });
  await audit(actor, "ORDER_NOTE_ADDED", { targetType: "order", targetId: orderId });
}

const LINKABLE: OrderStatus[] = ["QUOTE_READY", "EXPIRED", "PAYMENT_SUBMITTED"];

/** Admin links an unmatched transfer to an order by hand (spec 5.4). */
export async function linkTransferToOrder(transferId: string, orderId: string, note: string, actor: Actor) {
  if (!note?.trim()) throw new AppError("A note is required to link a payment by hand.");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('match-transfers'))`;
    const t = await tx.incomingTransfer.findUnique({ where: { id: transferId } });
    if (!t || (t.status !== "UNMATCHED" && t.status !== "MANUAL_HANDLING")) throw new AppError("This payment is not waiting to be linked.");
    const o = await tx.order.findUnique({ where: { id: orderId } });
    if (!o) throw new AppError("Order not found", 404);
    if (o.txid) throw new AppError("This order already has a payment linked.");
    await tx.incomingTransfer.update({ where: { id: t.id }, data: { status: "MATCHED", matchedOrderId: o.id, handlingNote: note.trim() } });
    const data = { txid: t.txid, transferPosition: t.transferPosition, senderAddress: t.fromAddress, receivedAmount: t.amount, confirmedAt: new Date() };
    const extra = t.network !== o.network ? ` (paid on ${t.network}, order is ${o.network})` : "";
    if (LINKABLE.includes(o.status)) {
      await transition(tx, o.id, "PAYMENT_CONFIRMED", actor, { from: o.status, publicMessage: "Payment received.", privateNote: `Linked by hand: ${note.trim()}${extra}`, data });
    } else if (o.status === "ON_HOLD") {
      await tx.order.update({ where: { id: o.id }, data });
      await tx.adminNote.create({ data: { orderId: o.id, adminId: actor.id!, note: `Payment linked by hand: ${note.trim()}${extra}` } });
    } else throw new AppError(`Can't link a payment to an order in status ${o.status}.`);
    await audit(actor, "TRANSFER_LINKED", { targetType: "incoming_transfer", targetId: t.id, details: { orderId: o.id, note: note.trim() } }, tx);
  });
}

export async function markTransferManual(transferId: string, note: string, actor: Actor) {
  if (!note?.trim()) throw new AppError("A note is required.");
  const res = await prisma.incomingTransfer.updateMany({ where: { id: transferId, status: "UNMATCHED" }, data: { status: "MANUAL_HANDLING", handlingNote: note.trim() } });
  if (res.count !== 1) throw new AppError("This payment is not in the unmatched list.");
  await audit(actor, "TRANSFER_MARKED_MANUAL", { targetType: "incoming_transfer", targetId: transferId, details: { note: note.trim() } });
}
