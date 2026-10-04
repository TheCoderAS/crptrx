import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { assertOwned } from "@/server/scope";
import { setChatResolved } from "@/server/chat/service";

type Ctx = { params: Promise<{ id: string }> };

/** Mark an order's chat resolved, or reopen it. */
export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  await assertOwned(a.admin, "order", id);
  const b = await body<{ resolved?: boolean | string }>(req);
  await setChatResolved(id, a.admin.id, b.resolved === true || b.resolved === "true");
  return {};
});
