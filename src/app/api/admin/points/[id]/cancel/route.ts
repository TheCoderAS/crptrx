import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { cancelPoints } from "@/server/points";

type Ctx = { params: Promise<{ id: string }> };

/** Super admin cancels pending referral points (reason logged, shown to the user). */
export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx("SUPER_ADMIN");
  const { id } = await ctx.params;
  const b = await body<{ reason?: string }>(req);
  await cancelPoints(id, b.reason, a.actor);
  return { message: "Points cancelled." };
});
