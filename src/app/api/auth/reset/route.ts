import { api, body } from "@/server/http";
import { clientIp } from "@/server/auth/session";
import { resetPassword } from "@/server/auth/password";

export const POST = api(async (req: Request) => {
  const b = await body<{ token: string; password: string }>(req);
  await resetPassword(b.token, b.password, await clientIp());
  return { redirect: "/login?reset=1", message: "Password changed. Please sign in." };
});
