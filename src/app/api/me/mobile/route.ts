import { api, body } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { sendMobileOtp } from "@/server/auth/user";

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const { mobile } = await body<{ mobile: string }>(req);
  const devCode = await sendMobileOtp(user.id, String(mobile ?? ""));
  return { message: devCode ? `Code sent. (Test mode: your code is ${devCode})` : "Code sent by SMS." };
});
