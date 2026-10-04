import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { setReward } from "@/server/earnings";

type Ctx = { params: Promise<{ id: string }> };

/** A customer's bonus on future orders: their own admin, or a super admin. Logged. */
export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  const b = await body<{ rewardPercent?: string }>(req);
  await setReward(a.admin, a.actor, id, b.rewardPercent, a.ip);
  return { message: "Saved. Applies to new quotes." };
});
