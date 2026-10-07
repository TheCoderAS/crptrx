import type { OrderStatus, Prisma } from "@prisma/client";
import type { Actor } from "../audit";
import { prisma, type Tx } from "../db";
import { AppError } from "../errors";
import { onOrderStatus } from "../points";

/** Spec section 6. The server rejects every move not listed here. */
export const ALLOWED_NEXT: Record<OrderStatus, OrderStatus[]> = {
  QUOTE_READY: ["PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED", "EXPIRED"],
  EXPIRED: ["PAYMENT_CONFIRMED"],
  PAYMENT_SUBMITTED: ["PAYMENT_CONFIRMED", "ON_HOLD"],
  PAYMENT_CONFIRMED: ["UNDER_REVIEW", "ON_HOLD"],
  UNDER_REVIEW: ["APPROVED", "ON_HOLD"],
  ON_HOLD: ["UNDER_REVIEW", "CLOSED_MANUAL", "PAYMENT_SUBMITTED"], // the last: re-checking a payment we couldn't find
  APPROVED: ["PAID", "ON_HOLD"],
  PAID: [],
  CLOSED_MANUAL: [],
};

export const OPEN_QUOTE_STATUSES: OrderStatus[] = ["QUOTE_READY", "PAYMENT_SUBMITTED"];
export const FINAL_STATUSES: OrderStatus[] = ["PAID", "CLOSED_MANUAL"];

export const canMove = (from: OrderStatus, to: OrderStatus) => ALLOWED_NEXT[from].includes(to);

export class TransitionError extends AppError {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`An order can't move from ${from} to ${to}`, 409, "BAD_TRANSITION");
  }
}

export interface TransitionOpts {
  publicMessage?: string | null;
  privateNote?: string | null;
  data?: Prisma.OrderUpdateInput;
  /** Expected current status; defaults to whatever the order is in now. */
  from?: OrderStatus;
}

/**
 * Move an order to a new status and write the permanent timeline entry, in the
 * caller's transaction. Uses a conditional update so two concurrent moves from
 * the same status can't both succeed.
 */
export async function transition(tx: Tx, orderId: string, to: OrderStatus, actor: Actor, opts: TransitionOpts = {}) {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) throw new AppError("Order not found", 404, "NOT_FOUND");
  const from = opts.from ?? order.status;
  if (order.status !== from || !canMove(from, to)) throw new TransitionError(order.status, to);
  const res = await tx.order.updateMany({
    where: { id: orderId, status: from },
    data: { ...(opts.data as Prisma.OrderUpdateManyMutationInput), status: to },
  });
  if (res.count !== 1) throw new TransitionError(from, to);
  await tx.orderEvent.create({
    data: {
      orderId,
      fromStatus: from,
      toStatus: to,
      actorType: actor.type,
      actorId: actor.id,
      publicMessage: opts.publicMessage ?? null,
      privateNote: opts.privateNote ?? null,
    },
  });
  // Referral points held on this order: spent when paid, given back when it expires or closes.
  await onOrderStatus(tx, orderId, from, to);
  return { from, to };
}

export const transitionNow = (orderId: string, to: OrderStatus, actor: Actor, opts: TransitionOpts = {}) =>
  prisma.$transaction((tx) => transition(tx, orderId, to, actor, opts));
