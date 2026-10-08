import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { setReferralRules } from "@/server/points";

type Ctx = { params: Promise<{ id: string }> };

/** Super admin: one user's referral code on/off and its own reward rules. Logged. */
export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx("SUPER_ADMIN");
  const { id } = await ctx.params;
  const b = await body<{ enabled?: string; mode?: string; pointsPerUsdt?: string; maxPoints?: string }>(req);
  await setReferralRules(id, b, a.actor, a.ip);
  return { message: "Saved. Applies to sales paid from now on." };
});
