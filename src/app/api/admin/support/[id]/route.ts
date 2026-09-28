import { api } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (_req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  await prisma.supportMessage.update({ where: { id }, data: { handled: true } });
  await audit(a.actor, "SUPPORT_MESSAGE_HANDLED", { targetType: "support_message", targetId: id });
  return {};
});
