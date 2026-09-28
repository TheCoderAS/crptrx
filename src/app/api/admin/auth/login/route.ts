import { api, body } from "@/server/http";
import { verifyAdminPassword } from "@/server/auth/admin";
import { clientIp, createSession } from "@/server/auth/session";
import { rateLimit } from "@/server/ratelimit";

export const POST = api(async (req: Request) => {
  const ip = await clientIp();
  await rateLimit(`admin-login:${ip}`, 20, 15 * 60);
  const { email, password } = await body<{ email: string; password: string }>(req);
  const admin = await verifyAdminPassword(String(email ?? ""), String(password ?? ""), ip);
  // Password is only step one; the session can't do anything until 2FA passes.
  await createSession("ADMIN", admin.id, "PASSWORD_OK");
  return { redirect: "/admin/2fa" };
});
