import { api, body } from "@/server/http";
import { clientIp, requireUser } from "@/server/auth/session";
import { setPassword } from "@/server/auth/password";

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const b = await body<{ current?: string; password: string }>(req);
  await setPassword(user, b.current, b.password, await clientIp());
  return { redirect: "/account", message: "Password saved." };
});
