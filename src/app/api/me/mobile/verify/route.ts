import { api, body } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { verifyMobileOtp } from "@/server/auth/user";

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const { code } = await body<{ code: string }>(req);
  await verifyMobileOtp(user.id, String(code ?? ""));
  return { redirect: "/kyc" };
});
