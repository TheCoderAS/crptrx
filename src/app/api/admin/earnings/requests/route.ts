import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { requestPayout } from "@/server/payoutRequests";
import { fmtInr } from "@/server/money";

/** An admin asks the super admin to pay out what they're owed. */
export const POST = api(async (req: Request) => {
  const a = await adminCtx();
  const b = await body<{ note?: string; totp?: string }>(req);
  await recheck2fa(a, b.totp, "payout_request");
  const r = await requestPayout(a.admin, b.note, a.actor, a.ip);
  return { message: `Asked for ${fmtInr(r.amount)}. You'll be told when it's paid.` };
});
