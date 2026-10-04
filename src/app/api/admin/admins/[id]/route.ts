import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { checkReferralFields, releaseCustomers, saveReferral } from "@/server/referral";

type Ctx = { params: Promise<{ id: string }> };

/** Admins are never deleted, only disabled, so history stays linked (spec 5.6). */
export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx("SUPER_ADMIN");
  const { id } = await ctx.params;
  const b = await body<{ action: string; totp: string; inviteCode?: string; profitPercent?: string }>(req);
  if (b.action === "referral") {
    // Code and profit share: money-related, but not an account takeover risk, so no 2FA prompt.
    const target = await prisma.admin.findUnique({ where: { id }, select: { role: true, inviteCode: true, profitPercent: true } });
    if (!target) throw new AppError("Admin not found", 404, "NOT_FOUND");
    if (target.role !== "ADMIN") throw new AppError("Super admins don't have an invite code: customers without an admin are already theirs.");
    const ref = checkReferralFields(b);
    if (!ref.inviteCode) throw new AppError("Enter an invite code.");
    await saveReferral(id, ref);
    await audit(a.actor, "ADMIN_REFERRAL_CHANGED", { targetType: "admin", targetId: id, details: { old: { inviteCode: target.inviteCode, profitPercent: target.profitPercent.toString() }, new: ref }, ip: a.ip });
    return { message: "Saved. New paid orders use the new share; earlier ones keep theirs." };
  }
  await recheck2fa(a, b.totp, "admin_update");
  if (id === a.admin.id) throw new AppError("You can't change your own account here.");
  if (b.action === "disable" || b.action === "enable") {
    await prisma.$transaction(async (tx) => {
      await tx.admin.update({ where: { id }, data: { status: b.action === "disable" ? "DISABLED" : "ACTIVE" } });
      if (b.action === "disable") {
        await tx.session.deleteMany({ where: { subjectType: "ADMIN", subjectId: id } });
        await releaseCustomers(id, a.actor, tx);
      }
    });
  } else if (b.action === "reset_2fa") {
    await prisma.admin.update({ where: { id }, data: { totpEnabled: false, totpSecretEncrypted: null, lastTotpStep: null } });
    await prisma.session.deleteMany({ where: { subjectType: "ADMIN", subjectId: id } });
  } else throw new AppError("Unknown action");
  await audit(a.actor, `ADMIN_${b.action.toUpperCase()}`, { targetType: "admin", targetId: id, ip: a.ip });
  return {};
});
