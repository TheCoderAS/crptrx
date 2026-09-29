import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { acceptCurrentMarket } from "@/server/rateFeed";

/** After a big market move is refused, the super admin confirms the new price. */
export const POST = api(async (req: Request) => {
  const a = await adminCtx("SUPER_ADMIN");
  const b = await body<{ totp: string }>(req);
  await recheck2fa(a, b.totp, "rate_accept");
  const r = await acceptCurrentMarket({ type: "ADMIN", id: a.admin.id }, a.ip);
  if ("ok" in r) return { message: r.ok ? `Accepted. Live rate is now ₹${r.rate.toFixed(2)}.` : `Still not updated: ${r.reason}` };
  return { message: "Accepted. (Rate mode is Manual, so nothing else changed.)" };
});
