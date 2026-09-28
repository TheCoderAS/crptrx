import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { checkPasswordRules, hashPassword } from "@/server/auth/admin";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";

export const POST = api(async (req: Request) => {
  const a = await adminCtx("SUPER_ADMIN");
  const b = await body<Record<string, string>>(req);
  await recheck2fa(a, b.totp, "admin_create");
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError("Enter an email.");
  if (!b.name?.trim()) throw new AppError("Enter a name.");
  checkPasswordRules(b.password);
  const role = b.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN";
  const created = await prisma.admin.create({ data: { name: b.name.trim(), email, role, passwordHash: await hashPassword(b.password) } });
  await audit(a.actor, "ADMIN_CREATED", { targetType: "admin", targetId: created.id, details: { email, role }, ip: a.ip });
  return { message: `Created. ${email} must set up an authenticator app at first sign-in.` };
});
