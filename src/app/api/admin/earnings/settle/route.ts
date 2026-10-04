import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { settleAdmin } from "@/server/earnings";
import { fmtInr } from "@/server/money";

/** Super admin records that they paid an admin all their pending earnings. */
export const POST = api(async (req: Request) => {
  const a = await adminCtx("SUPER_ADMIN");
  const b = await body<{ adminId: string; reference?: string; note?: string; expectedAmount?: string; totp?: string }>(req);
  await recheck2fa(a, b.totp, "earnings_settle");
  const st = await settleAdmin(String(b.adminId ?? ""), b, a.actor);
  return { message: `Recorded ${fmtInr(st.amount)} paid (${st.count} ${st.count === 1 ? "order" : "orders"}).` };
});
