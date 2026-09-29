import { api, body } from "@/server/http";
import { clientIp, currentSessionId, requireUser } from "@/server/auth/session";
import { setPassword } from "@/server/auth/password";

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const b = await body<{ current?: string; password: string }>(req);
  await setPassword(user, b.current, b.password, await clientIp(), await currentSessionId("USER"));
  return { redirect: "/account", message: "Password saved. Other devices were signed out." };
});
