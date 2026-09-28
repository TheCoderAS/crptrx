import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { setNetworkMode } from "@/server/settings";

export const POST = api(async (req: Request) => {
  const a = await adminCtx("SUPER_ADMIN");
  const b = await body<{ mode: "TEST" | "LIVE"; confirm: string; totp: string }>(req);
  await recheck2fa(a, b.totp, "network_mode");
  await setNetworkMode(b.mode, String(b.confirm ?? ""), a.actor, a.ip);
  return { message: `Network mode is now ${b.mode}.` };
});
