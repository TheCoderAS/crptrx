import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { notifyPayoutMethod } from "@/server/notify";
import { reviewPayoutMethod } from "@/server/payouts";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  const b = await body<{ decision: "APPROVED" | "DECLINED"; reason?: string }>(req);
  const pm = await reviewPayoutMethod(id, b.decision, b.reason, a.actor);
  await notifyPayoutMethod(pm.userId, b.decision === "APPROVED", b.reason);
  return { redirect: "/admin/reviews?tab=payout" };
});
