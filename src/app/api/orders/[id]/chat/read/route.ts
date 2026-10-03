import { api } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { markChatRead } from "@/server/chat/service";

type Ctx = { params: Promise<{ id: string }> };

/** The customer has seen the chat so far (drives support's "Seen" mark and the unread dots). */
export const POST = api(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await markChatRead(id, { type: "USER", userId: user.id });
  return {};
});
