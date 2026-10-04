import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { reassignCustomer } from "@/server/referral";

type Ctx = { params: Promise<{ id: string }> };

/** Super admin moves a customer to another admin, or to the house. Paid orders keep their earnings. */
export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx("SUPER_ADMIN");
  const { id } = await ctx.params;
  const b = await body<{ adminId?: string; reason?: string }>(req);
  const to = !b.adminId || b.adminId === "house" ? null : b.adminId;
  await reassignCustomer(id, to, a.actor, String(b.reason ?? ""), a.ip);
  return { message: "Moved. New orders count for the new admin." };
});
