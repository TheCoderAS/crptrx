import { api } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { signedUrl } from "@/server/storage";

type Ctx = { params: Promise<{ id: string; msgId: string }> };

/** A screenshot in the customer's own order chat (short-lived private link). */
export const GET = api(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id, msgId } = await ctx.params;
  const m = await prisma.supportMessage.findFirst({ where: { id: msgId, orderId: id, userId: user.id } });
  if (!m?.attachmentKey) throw new AppError("Not found", 404);
  return new Response(null, { status: 303, headers: { location: await signedUrl(m.attachmentKey) } });
});
