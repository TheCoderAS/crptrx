import { api, formData } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { assertOwned } from "@/server/scope";
import { rateLimit } from "@/server/ratelimit";
import { listChat, sendChat } from "@/server/chat/service";
import { chatAttachment } from "@/server/chat/upload";

type Ctx = { params: Promise<{ id: string }> };

/** Support's side of an order's chat. */
export const GET = api(async (_req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  await assertOwned(a.admin, "order", id);
  return listChat(id, { type: "ADMIN", adminId: a.admin.id });
});

export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  await assertOwned(a.admin, "order", id);
  await rateLimit(`chat-admin:${a.admin.id}`, 120, 10 * 60);
  const fd = await formData(req);
  const attachmentKey = await chatAttachment(fd, `admin-${a.admin.id}`);
  return { message: await sendChat(id, { type: "ADMIN", adminId: a.admin.id }, String(fd.get("text") ?? ""), attachmentKey) };
});
