import { api, body } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { saveMobileUnverified, sendMobileOtp } from "@/server/auth/user";
import { getSettings } from "@/server/settings";

/** "Confirm mobile number" on: send an SMS code. Off: save the number straight away. */
export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const { mobile } = await body<{ mobile: string }>(req);
  if (!(await getSettings()).onboarding_mobile_required) {
    await saveMobileUnverified(user.id, String(mobile ?? ""));
    return { message: "Mobile number saved." };
  }
  const devCode = await sendMobileOtp(user.id, String(mobile ?? ""));
  return { message: devCode ? `Code sent. (Test mode: your code is ${devCode})` : "Code sent by SMS." };
});
