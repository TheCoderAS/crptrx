import { api, body } from "@/server/http";
import { clientIp } from "@/server/auth/session";
import { requestPasswordReset } from "@/server/auth/password";

export const POST = api(async (req: Request) => {
  const { email } = await body<{ email: string }>(req);
  await requestPasswordReset(email, await clientIp());
  return { message: "If an account uses that email, a reset link is on its way. It works for 30 minutes." };
});
