import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  const b = await body<{ action: string; reason?: string }>(req);
  if (b.action !== "disable" && b.action !== "enable") throw new AppError("Unknown action");
  if (!b.reason?.trim()) throw new AppError("A reason is required.");
  await prisma.user.update({ where: { id }, data: { status: b.action === "disable" ? "DISABLED" : "ACTIVE" } });
  if (b.action === "disable") await prisma.session.deleteMany({ where: { subjectType: "USER", subjectId: id } });
  await audit(a.actor, `USER_${b.action.toUpperCase()}D`, { targetType: "user", targetId: id, details: { reason: b.reason } });
  return {};
});
