import { api, body } from "@/server/http";
import { verifyFirebaseIdToken } from "@/server/auth/firebase";
import { clientIp, createSession } from "@/server/auth/session";
import { upsertUserFromIdentity } from "@/server/auth/user";
import { rateLimit } from "@/server/ratelimit";
import { AppError } from "@/server/errors";
import { getSettings } from "@/server/settings";
import { afterLoginPath } from "@/server/auth/pages";

export const POST = api(async (req: Request) => {
  if (!(await getSettings()).auth_google_enabled) throw new AppError("Google sign-in is turned off. Please use another sign-in option.", 403, "METHOD_OFF");
  const ip = await clientIp();
  await rateLimit(`login:${ip}`, 20, 15 * 60);
  const { idToken } = await body<{ idToken: string }>(req);
  const identity = await verifyFirebaseIdToken(String(idToken ?? ""));
  const user = await upsertUserFromIdentity(identity, ip);
  await createSession("USER", user.id);
  return { redirect: await afterLoginPath(user) };
});
