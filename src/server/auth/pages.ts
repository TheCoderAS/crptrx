import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { getSettings } from "../settings";
import { currentAdmin, currentUser, needsEmailVerification, pendingAdmin } from "./session";

/** For server components: send logged-out visitors to the login page, unconfirmed emails to the confirm page. */
export async function userOrLogin(opts: { allowUnverified?: boolean } = {}) {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!opts.allowUnverified && (await needsEmailVerification(u))) redirect("/verify-email");
  return u;
}

/** Where to go right after signing in, based on the current onboarding settings. */
export async function afterLoginPath(u: User): Promise<string> {
  const s = await getSettings();
  if (!u.emailVerified && s.auth_email_verification_required) return "/verify-email";
  if (s.onboarding_mobile_required && !u.mobileVerifiedAt) return "/account";
  return "/dashboard";
}

export async function adminOrLogin(role: "ADMIN" | "SUPER_ADMIN" = "ADMIN") {
  const a = await currentAdmin();
  if (!a) {
    if (await pendingAdmin()) redirect("/admin/2fa");
    redirect("/admin/login");
  }
  if (role === "SUPER_ADMIN" && a.role !== "SUPER_ADMIN") redirect("/admin");
  return a;
}

/** Sign-in options to show, from the admin switches and what the server is configured for. */
export async function signInMethods() {
  const { env } = await import("../env");
  const s = await getSettings();
  const fb = env.firebase.webConfig;
  return {
    brand: s.brand_name,
    google: s.auth_google_enabled && fb ? fb : null,
    googleMisconfigured: s.auth_google_enabled && !fb,
    email: s.auth_email_enabled,
    verificationRequired: s.auth_email_verification_required,
    dev: env.devLoginEnabled && s.network_mode !== "LIVE",
  };
}
