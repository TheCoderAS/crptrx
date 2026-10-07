import { api, body } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { createQuote } from "@/server/orders/quote";
import { rateLimit } from "@/server/ratelimit";
import type { NetworkCode } from "@/lib/networks";

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(`quote:${user.id}`, 10, 10 * 60);
  const b = await body<Record<string, string>>(req);
  const order = await createQuote(
    { userId: user.id, network: b.network as NetworkCode, amountType: b.amountType === "INR" ? "INR" : "USDT", amount: String(b.amount ?? ""), payoutMethodId: String(b.payoutMethodId ?? ""), usePoints: String(b.usePoints) === "true" || String(b.usePoints) === "on" },
    { type: "USER", id: user.id },
  );
  return { redirect: `/orders/${order.id}?step=quote` };
});
