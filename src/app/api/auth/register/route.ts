import { api, body } from "@/server/http";
import { clientIp, createSession } from "@/server/auth/session";
import { afterLoginPath } from "@/server/auth/pages";
import { registerWithPassword } from "@/server/auth/password";
import { getSettings } from "@/server/settings";

export const POST = api(async (req: Request) => {
  const ip = await clientIp();
  const b = await body<{ email: string; password: string; terms?: string }>(req);
  const user = await registerWithPassword(b.email, b.password, ip);
  // Same answer whether or not the email already had an account.
  if (!user) return { redirect: "/verify-email?sent=1", message: "Check your inbox to continue." };
  await createSession("USER", user.id);
  const s = await getSettings();
  return { redirect: await afterLoginPath(user), message: s.auth_email_verification_required ? "Account created. Check your inbox for the confirmation link." : "Account created." };
});
