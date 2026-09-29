import { api, body } from "@/server/http";
import { clientIp, createSession } from "@/server/auth/session";
import { afterLoginPath } from "@/server/auth/pages";
import { loginWithPassword } from "@/server/auth/password";

export const POST = api(async (req: Request) => {
  const ip = await clientIp();
  const b = await body<{ email: string; password: string }>(req);
  const user = await loginWithPassword(b.email, b.password, ip);
  await createSession("USER", user.id);
  return { redirect: await afterLoginPath(user) };
});
