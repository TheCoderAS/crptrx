import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { AppError } from "@/server/errors";
import { env } from "@/server/env";
import { rateLimit } from "@/server/ratelimit";
import { PUSH_PLATFORMS, registerAdminPushDevice, unregisterAdminPushDevice, webPushReady, type PushPlatform } from "@/server/firebase/push";

// Support staff's devices for "customer wrote" push notifications.

function parse(b: { token?: unknown; platform?: unknown }) {
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (token.length < 20 || token.length > 4096) throw new AppError("Invalid device token.");
  const platform = (typeof b.platform === "string" ? b.platform.toUpperCase() : "WEB") as PushPlatform;
  if (!PUSH_PLATFORMS.includes(platform)) throw new AppError("Unknown platform.");
  return { token, platform };
}

export const GET = api(async () => {
  await adminCtx();
  return webPushReady() ? { enabled: true, config: { ...env.firebase.webConfig, messagingSenderId: env.firebase.messagingSenderId }, vapidKey: env.firebase.vapidKey } : { enabled: false };
});

export const POST = api(async (req: Request) => {
  const a = await adminCtx();
  await rateLimit(`push-admin:${a.admin.id}`, 30, 3600);
  const { token, platform } = parse(await body(req));
  await registerAdminPushDevice(a.admin.id, token, platform);
  return {};
});

export const DELETE = api(async (req: Request) => {
  const a = await adminCtx();
  const { token } = parse(await body(req));
  await unregisterAdminPushDevice(a.admin.id, token);
  return {};
});
