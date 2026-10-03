import { api, formData } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { rateLimit } from "@/server/ratelimit";
import { listChat, sendChat } from "@/server/chat/service";
import { chatAttachment } from "@/server/chat/upload";

type Ctx = { params: Promise<{ id: string }> };

/** The customer's support chat on their order. */
export const GET = api(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return listChat(id, { type: "USER", userId: user.id });
});

export const POST = api(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await rateLimit(`chat:${user.id}`, 20, 10 * 60);
  const fd = await formData(req);
  const attachmentKey = await chatAttachment(fd, user.id);
  return { message: await sendChat(id, { type: "USER", userId: user.id }, String(fd.get("text") ?? ""), attachmentKey) };
});
