import { api } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { chatToken } from "@/server/firebase/chatSignal";

/** Sign-in for live chat updates on the admin side (may read every order's chat signal). */
export const POST = api(async () => {
  const a = await adminCtx();
  const t = await chatToken({ type: "ADMIN", adminId: a.admin.id });
  return t ? { live: true, ...t } : { live: false };
});
