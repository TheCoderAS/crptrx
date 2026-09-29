import { api } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { resendVerification } from "@/server/auth/password";

export const POST = api(async () => {
  const user = await requireUser({ allowUnverified: true });
  await resendVerification(user);
  return { message: `We sent a new link to ${user.email}.` };
});
