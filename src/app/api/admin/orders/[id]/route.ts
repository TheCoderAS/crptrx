import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { AppError } from "@/server/errors";
import { notifyOrder } from "@/server/notify";
import { addNote, approveOrder, closeManual, markPaid, putOnHold, releaseHold, saveWalletCheck, startReview } from "@/server/orders/actions";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  const b = await body<Record<string, string>>(req);
  switch (b.action) {
    case "start_review":
      await startReview(id, a.actor);
      break;
    case "hold":
      await putOnHold(id, { reason: b.reason, message: b.message, note: b.note }, a.actor);
      await notifyOrder(id, "ON_HOLD");
      break;
    case "release":
      await releaseHold(id, b.note, a.actor);
      break;
    case "wallet_check":
      await saveWalletCheck(id, { result: b.result, note: b.note }, a.actor);
      break;
    case "approve":
      await approveOrder(id, a.actor);
      await notifyOrder(id, "APPROVED");
      break;
    case "mark_paid":
      await recheck2fa(a, b.totp, "mark_paid");
      // datetime-local has no zone; the admin enters IST.
      await markPaid(id, { utr: b.utr, amount: b.amount, paidAt: b.paidAt && !/[zZ+]/.test(b.paidAt.slice(10)) ? `${b.paidAt}+05:30` : b.paidAt }, a.actor);
      await notifyOrder(id, "PAID");
      break;
    case "close_manual":
      await closeManual(id, { resolutionNote: b.resolutionNote, returnTxid: b.returnTxid }, a.actor);
      break;
    case "note":
      await addNote(id, b.note, a.actor);
      break;
    default:
      throw new AppError("Unknown action");
  }
  return {};
});
