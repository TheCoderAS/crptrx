import { api, body } from "@/server/http";
import { clientIp, createSession } from "@/server/auth/session";
import { afterLoginPath } from "@/server/auth/pages";
import { registerWithPassword } from "@/server/auth/password";
import { getSettings } from "@/server/settings";

const SAME_ANSWER = { redirect: "/verify-email?sent=1", message: "Check your inbox to continue." };

export const POST = api(async (req: Request) => {
  const ip = await clientIp();
  const b = await body<{ email: string; password: string }>(req);
  const user = await registerWithPassword(b.email, b.password, ip);
  const s = await getSettings();
  // With email confirmation on, a new and an already-registered email get the
  // exact same answer (no login yet), so nobody can test which emails exist.
  if (s.auth_email_verification_required || !user) return SAME_ANSWER;
  // Confirmation off (the admin chose less friction): sign straight in.
  await createSession("USER", user.id);
  return { redirect: await afterLoginPath(user), message: "Account created." };
});
