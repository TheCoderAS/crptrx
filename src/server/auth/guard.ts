import type { Admin } from "@prisma/client";
import type { Actor } from "../audit";
import { checkAdminTotp } from "./admin";
import { clientIp, requireAdmin } from "./session";
import { rateLimit } from "../ratelimit";

export interface AdminCtx {
  admin: Admin;
  actor: Actor;
  ip: string | null;
}

export async function adminCtx(role: "ADMIN" | "SUPER_ADMIN" = "ADMIN"): Promise<AdminCtx> {
  const admin = await requireAdmin(role);
  return { admin, actor: { type: "ADMIN", id: admin.id }, ip: await clientIp() };
}

/** Re-enter the 2FA code for sensitive actions (spec 10.3, 10.4). */
export async function recheck2fa(ctx: AdminCtx, code: unknown, purpose: string) {
  await rateLimit(`admin-2fa:${ctx.admin.id}`, 10, 15 * 60);
  await checkAdminTotp(ctx.admin, String(code ?? ""), purpose, ctx.ip);
}
