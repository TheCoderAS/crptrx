import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { assertOwned, isSuper } from "@/server/scope";
import { AppError } from "@/server/errors";
import { notifyMatchEvents, notifyOrder, notifySuperAdmins } from "@/server/notify";
import { recheckPayment } from "@/server/matching";
import { addNote, approveOrder, closeManual, markPaid, putOnHold, releaseHold, saveWalletCheck, startReview } from "@/server/orders/actions";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  await assertOwned(a.admin, "order", id);
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
      await approveOrder(id, a.actor, b.overrideNote);
      await notifyOrder(id, "APPROVED");
      if (!isSuper(a.admin)) void notifySuperAdmins(`Order ${id} approved: pay it`, `${a.admin.name} approved order ${id}. It's waiting for you to send the payout.`, `/admin/orders/${id}`);
      break;
    case "mark_paid":
      // Fraud control: only a super admin sends the money.
      if (!isSuper(a.admin)) throw new AppError("Only a super admin can mark an order paid.", 403);
      await recheck2fa(a, b.totp, "mark_paid");
      // datetime-local has no zone; the admin enters IST.
      await markPaid(id, { utr: b.utr, amount: b.amount, paidAt: b.paidAt && !/[zZ+]/.test(b.paidAt.slice(10)) ? `${b.paidAt}+05:30` : b.paidAt }, a.actor);
      await notifyOrder(id, "PAID");
      break;
    case "close_manual":
      await closeManual(id, { resolutionNote: b.resolutionNote, returnTxid: b.returnTxid }, a.actor);
      break;
    case "recheck":
      await notifyMatchEvents(await recheckPayment(id, a.actor));
      break;
    case "note":
      await addNote(id, b.note, a.actor);
      break;
    default:
      throw new AppError("Unknown action");
  }
  return {};
});
