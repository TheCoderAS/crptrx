import type { Admin } from "@prisma/client";
import type { Actor } from "../audit";
import { checkAdminTotp } from "./admin";
import { adminStepUpFresh, clientIp, markAdminStepUp, requireAdmin } from "./session";
import { AppError } from "../errors";
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

/**
 * Sensitive actions (spec 10.3, 10.4) need a 2FA code entered in the last
 * 15 minutes. If there isn't one, the browser is asked for a code once
 * (STEP_UP_REQUIRED) and the action is retried with it.
 */
export async function recheck2fa(ctx: AdminCtx, code: unknown, purpose: string) {
  const c = String(code ?? "").trim();
  if (!c) {
    if (await adminStepUpFresh()) return;
    throw new AppError("Enter your 2FA code to confirm this.", 401, "STEP_UP_REQUIRED");
  }
  await rateLimit(`admin-2fa:${ctx.admin.id}`, 10, 15 * 60);
  await checkAdminTotp(ctx.admin, c, purpose, ctx.ip);
  await markAdminStepUp();
}
