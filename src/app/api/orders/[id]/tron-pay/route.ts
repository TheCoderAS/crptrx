import { api, body } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { verifySubmittedTxid } from "@/server/matching";
import { notifyMatchEvents } from "@/server/notify";
import { submitTxid } from "@/server/orders/actions";
import { rateLimit } from "@/server/ratelimit";
import { getSettings, tokenContractFor } from "@/server/settings";
import { broadcastTronTransfer, buildTronTransfer } from "@/server/tronPay";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Tron payment from a WalletConnect wallet app, in two steps:
 * "build" returns the unsigned transfer for the customer's wallet to sign;
 * "send" checks the signed one is this order's payment, sends it and records it.
 */
export const POST = api(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await rateLimit(`tronpay:${user.id}`, 20, 10 * 60);
  const o = await prisma.order.findUnique({ where: { id } });
  if (!o || o.userId !== user.id) throw new AppError("Order not found", 404);
  if (o.network !== "TRON") throw new AppError("This order isn't on Tron.");
  if (o.status !== "QUOTE_READY") throw new AppError("This order is no longer waiting for a payment.", 409);
  const b = await body<{ step?: string; from?: string; signed?: unknown }>(req);
  // The token the payment watcher accepts, same as the browser-wallet button uses.
  const token = tokenContractFor(await getSettings(), "TRON");

  if (b.step === "build") return { transaction: await buildTronTransfer(o, token, String(b.from ?? "")) };
  if (b.step !== "send") throw new AppError("Unknown step");
  const txid = await broadcastTronTransfer(o, token, b.signed as Parameters<typeof broadcastTronTransfer>[2]);
  await submitTxid(o.id, user.id, txid, { type: "USER", id: user.id });
  try {
    await notifyMatchEvents(await verifySubmittedTxid(o.id));
  } catch {
    /* not final yet: the worker keeps checking */
  }
  return { txid };
});
