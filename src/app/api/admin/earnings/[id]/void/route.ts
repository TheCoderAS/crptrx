import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { voidEarning } from "@/server/earnings";

type Ctx = { params: Promise<{ id: string }> };

/** Super admin cancels a pending earning (reason logged). */
export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx("SUPER_ADMIN");
  const { id } = await ctx.params;
  const b = await body<{ reason?: string }>(req);
  await voidEarning(id, String(b.reason ?? ""), a.actor);
  return { message: "Cancelled." };
});
