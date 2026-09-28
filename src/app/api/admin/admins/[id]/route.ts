import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";

type Ctx = { params: Promise<{ id: string }> };

/** Admins are never deleted, only disabled, so history stays linked (spec 5.6). */
export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx("SUPER_ADMIN");
  const { id } = await ctx.params;
  const b = await body<{ action: string; totp: string }>(req);
  await recheck2fa(a, b.totp, "admin_update");
  if (id === a.admin.id) throw new AppError("You can't change your own account here.");
  if (b.action === "disable" || b.action === "enable") {
    await prisma.admin.update({ where: { id }, data: { status: b.action === "disable" ? "DISABLED" : "ACTIVE" } });
    if (b.action === "disable") await prisma.session.deleteMany({ where: { subjectType: "ADMIN", subjectId: id } });
  } else if (b.action === "reset_2fa") {
    await prisma.admin.update({ where: { id }, data: { totpEnabled: false, totpSecretEncrypted: null, lastTotpStep: null } });
    await prisma.session.deleteMany({ where: { subjectType: "ADMIN", subjectId: id } });
  } else throw new AppError("Unknown action");
  await audit(a.actor, `ADMIN_${b.action.toUpperCase()}`, { targetType: "admin", targetId: id, ip: a.ip });
  return {};
});
