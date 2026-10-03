import { api } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { chatToken } from "@/server/firebase/chatSignal";

/** Sign-in for live chat updates. { live: false } means "check every few seconds instead". */
export const POST = api(async () => {
  const user = await requireUser();
  const t = await chatToken({ type: "USER", userId: user.id });
  return t ? { live: true, ...t, userId: user.id } : { live: false };
});
