import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { AppError } from "@/server/errors";
import { EDITABLE_KEYS, getSettings, updateSetting, type SettingKey } from "@/server/settings";
import { refreshAutoRate } from "@/server/rateFeed";

// Settings that can let money go to the wrong place or lock admins out.
// Everything else saves without a 2FA code.
const SENSITIVE: SettingKey[] = ["test_token_contract", "admin_ip_allowlist"];

/**
 * Save one group of settings. Nested fields arrive as "key.SUB" (e.g.
 * network_enabled.TRON). Sensitive keys need a 2FA code from the last 15 minutes.
 */
export const POST = api(async (req: Request) => {
  const a = await adminCtx("SUPER_ADMIN");
  const b = await body<Record<string, unknown>>(req);
  const grouped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) {
    if (k === "totp") continue;
    const [key, sub] = k.split(".");
    if (!EDITABLE_KEYS.includes(key as SettingKey)) throw new AppError(`Unknown setting ${key}`);
    if (sub) grouped[key] = { ...((grouped[key] as object) ?? {}), [sub]: v };
    else grouped[key] = v;
  }
  if (Object.keys(grouped).length === 0) throw new AppError("Nothing to save.");
  const current = await getSettings();
  const changes = (k: string) => JSON.stringify(current[k as SettingKey]) !== JSON.stringify(grouped[k]);
  const turnsKycOffInLive = current.network_mode === "LIVE" && (grouped.kyc_required === false || grouped.kyc_required === "false") && current.kyc_required;
  if (turnsKycOffInLive || Object.keys(grouped).some((k) => SENSITIVE.includes(k as SettingKey) && changes(k))) await recheck2fa(a, b.totp, "settings");
  // Check combined switches before saving anything, so a refused save never half-applies.
  const off = (k: string) => grouped[k] === false || grouped[k] === "false";
  if (off("auth_google_enabled") && off("auth_email_enabled")) throw new AppError("Keep at least one sign-in method on (Google or email/password).");
  // Apply the mode first so a Manual -> Auto (or back) switch and its fields save together.
  // Apply the rate mode first, and switches being turned ON before ones turned OFF,
  // so swapping two related switches in one save never trips a "keep one on" rule.
  const rank = (k: string) => (k === "rate_mode" ? 0 : grouped[k] === true || grouped[k] === "true" ? 1 : 2);
  const order = Object.keys(grouped).sort((x, y) => rank(x) - rank(y));
  for (const k of order) await updateSetting(k as SettingKey, grouped[k], a.actor, a.ip);
  if (order.some((k) => k.startsWith("rate")) && (await getSettings()).rate_mode === "AUTO") {
    const r = await refreshAutoRate();
    if ("ok" in r) return { message: r.ok ? `Saved. Live rate is now ₹${r.rate.toFixed(2)} (market ₹${r.market.toFixed(2)}).` : `Saved, but the live rate was not updated: ${r.reason}` };
  }
  return { message: "Saved." };
});
