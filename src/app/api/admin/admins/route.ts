import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { checkPasswordRules, hashPassword } from "@/server/auth/admin";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { checkReferralFields, randomInviteCode } from "@/server/referral";

export const POST = api(async (req: Request) => {
  const a = await adminCtx("SUPER_ADMIN");
  const b = await body<Record<string, string>>(req);
  await recheck2fa(a, b.totp, "admin_create");
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError("Enter an email.");
  if (!b.name?.trim()) throw new AppError("Enter a name.");
  checkPasswordRules(b.password);
  const role = b.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN";
  // Super admins have no invite code: customers without an admin are theirs (the house).
  const ref = role === "ADMIN" ? checkReferralFields(b) : { inviteCode: null, profitPercent: "0" };
  if (role === "ADMIN" && !ref.inviteCode) ref.inviteCode = randomInviteCode();
  let created;
  try {
    created = await prisma.admin.create({ data: { name: b.name.trim(), email, role, passwordHash: await hashPassword(b.password), ...ref } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new AppError("That email or invite code is already used by another admin.", 409);
    throw e;
  }
  await audit(a.actor, "ADMIN_CREATED", { targetType: "admin", targetId: created.id, details: { email, role, ...ref }, ip: a.ip });
  return { message: `Created. ${email} must set up an authenticator app at first sign-in.` };
});
