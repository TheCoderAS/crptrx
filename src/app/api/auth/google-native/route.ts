import { api, body } from "@/server/http";
import { verifyFirebaseIdToken } from "@/server/auth/firebase";
import { firebaseIdTokenFromGoogle } from "@/server/auth/googleNative";
import { clientIp, createSession } from "@/server/auth/session";
import { upsertUserFromIdentity } from "@/server/auth/user";
import { rateLimit } from "@/server/ratelimit";
import { AppError } from "@/server/errors";
import { getSettings } from "@/server/settings";
import { afterLoginPath } from "@/server/auth/pages";

/** Google sign-in from the Android app (the phone's account picker gives a Google ID token). */
export const POST = api(async (req: Request) => {
  if (!(await getSettings()).auth_google_enabled) throw new AppError("Google sign-in is turned off. Please use another sign-in option.", 403, "METHOD_OFF");
  const ip = await clientIp();
  await rateLimit(`login:${ip}`, 20, 15 * 60);
  const { idToken, inviteCode, inviteSoft } = await body<{ idToken: string; inviteCode?: string; inviteSoft?: boolean }>(req);
  const identity = await verifyFirebaseIdToken(await firebaseIdTokenFromGoogle(String(idToken ?? "")));
  const user = await upsertUserFromIdentity(identity, ip, { code: inviteCode, soft: inviteSoft === true });
  await createSession("USER", user.id);
  return { redirect: await afterLoginPath(user) };
});
