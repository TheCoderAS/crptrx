import { api } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { adminPulse } from "@/server/pulse";

export const GET = api(async () => {
  const a = await adminCtx();
  return adminPulse(a.admin);
});
