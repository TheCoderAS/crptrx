import { api, body } from "@/server/http";
import { verifyFirebaseIdToken } from "@/server/auth/firebase";
import { clientIp, createSession } from "@/server/auth/session";
import { upsertUserFromIdentity } from "@/server/auth/user";
import { rateLimit } from "@/server/ratelimit";

export const POST = api(async (req: Request) => {
  const ip = await clientIp();
  await rateLimit(`login:${ip}`, 20, 15 * 60);
  const { idToken } = await body<{ idToken: string }>(req);
  const identity = await verifyFirebaseIdToken(String(idToken ?? ""));
  const user = await upsertUserFromIdentity(identity, ip);
  await createSession("USER", user.id);
  return { redirect: user.mobileVerifiedAt ? "/dashboard" : "/account" };
});
