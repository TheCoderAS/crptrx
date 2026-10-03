import { api, body } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { env } from "@/server/env";
import { rateLimit } from "@/server/ratelimit";
import { PUSH_PLATFORMS, registerPushDevice, unregisterPushDevice, type PushPlatform } from "@/server/firebase/push";

// Devices that get push notifications. The website registers browsers; the
// Android app will call the same endpoint with platform "ANDROID".

function parse(b: { token?: unknown; platform?: unknown }) {
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (token.length < 20 || token.length > 4096) throw new AppError("Invalid device token.");
  const platform = (typeof b.platform === "string" ? b.platform.toUpperCase() : "WEB") as PushPlatform;
  if (!PUSH_PLATFORMS.includes(platform)) throw new AppError("Unknown platform.");
  return { token, platform };
}

/** What a browser needs to sign up for push; enabled: false when push isn't set up. */
export const GET = api(async () => {
  await requireUser();
  const cfg = env.firebase.webConfig;
  const ready = !!(cfg && env.firebase.serviceAccount && env.firebase.messagingSenderId && env.firebase.vapidKey && cfg.appId);
  return ready ? { enabled: true, config: { ...cfg, messagingSenderId: env.firebase.messagingSenderId }, vapidKey: env.firebase.vapidKey } : { enabled: false };
});

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(`push:${user.id}`, 30, 3600);
  const { token, platform } = parse(await body(req));
  await registerPushDevice(user.id, token, platform);
  return {};
});

export const DELETE = api(async (req: Request) => {
  const user = await requireUser();
  const { token } = parse(await body(req));
  await unregisterPushDevice(user.id, token);
  return {};
});
