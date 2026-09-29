import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { AppError } from "@/server/errors";
import { EDITABLE_KEYS, getSettings, updateSetting, type SettingKey } from "@/server/settings";
import { refreshAutoRate } from "@/server/rateFeed";

/**
 * Save one group of settings. Nested fields arrive as "key.SUB" (e.g.
 * network_enabled.TRON). Requires a fresh 2FA code.
 */
export const POST = api(async (req: Request) => {
  const a = await adminCtx("SUPER_ADMIN");
  const b = await body<Record<string, unknown>>(req);
  await recheck2fa(a, b.totp, "settings");
  const grouped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) {
    if (k === "totp") continue;
    const [key, sub] = k.split(".");
    if (!EDITABLE_KEYS.includes(key as SettingKey)) throw new AppError(`Unknown setting ${key}`);
    if (sub) grouped[key] = { ...((grouped[key] as object) ?? {}), [sub]: v };
    else grouped[key] = v;
  }
  if (Object.keys(grouped).length === 0) throw new AppError("Nothing to save.");
  // Apply the mode first so a Manual -> Auto (or back) switch and its fields save together.
  const order = Object.keys(grouped).sort((x, y) => Number(y === "rate_mode") - Number(x === "rate_mode"));
  for (const k of order) await updateSetting(k as SettingKey, grouped[k], a.actor, a.ip);
  if (order.some((k) => k.startsWith("rate")) && (await getSettings()).rate_mode === "AUTO") {
    const r = await refreshAutoRate();
    if ("ok" in r) return { message: r.ok ? `Saved. Live rate is now ₹${r.rate.toFixed(2)} (market ₹${r.market.toFixed(2)}).` : `Saved, but the live rate was not updated: ${r.reason}` };
  }
  return { message: "Saved." };
});
