import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { AppError } from "@/server/errors";
import { EDITABLE_KEYS, updateSetting, type SettingKey } from "@/server/settings";

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
  for (const [k, v] of Object.entries(grouped)) await updateSetting(k as SettingKey, v, a.actor, a.ip);
  return { message: "Saved." };
});
