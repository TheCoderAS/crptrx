import { api } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { assertOwned } from "@/server/scope";
import { markChatRead } from "@/server/chat/service";

type Ctx = { params: Promise<{ id: string }> };

/** Support has seen the chat so far. */
export const POST = api(async (_req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  await assertOwned(a.admin, "order", id);
  await markChatRead(id, { type: "ADMIN", adminId: a.admin.id });
  return {};
});
