import { api } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { userPulse } from "@/server/pulse";

export const GET = api(async () => {
  const user = await requireUser({ allowUnverified: true });
  return userPulse(user.id);
});
