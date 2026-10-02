import { api } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { adminPulse } from "@/server/pulse";

export const GET = api(async () => {
  await adminCtx();
  return adminPulse();
});
