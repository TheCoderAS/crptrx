import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { assertOwned, isSuper } from "@/server/scope";
import { reviewKyc } from "@/server/kyc";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  await assertOwned(a.admin, "kycSubmission", id);
  const b = await body<{ decision: "APPROVED" | "NEEDS_CHANGES" | "DECLINED"; reason?: string }>(req);
  await reviewKyc(id, b.decision, b.reason, a.actor, isSuper(a.admin));
  return { redirect: "/admin/reviews?tab=kyc" };
});
