import { api, body } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { submitTxid } from "@/server/orders/actions";
import { verifySubmittedTxid } from "@/server/matching";
import { notifyMatchEvents } from "@/server/notify";
import { rateLimit } from "@/server/ratelimit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await rateLimit(`txid:${user.id}`, 10, 10 * 60);
  const { txid } = await body<{ txid: string }>(req);
  await submitTxid(id, user.id, String(txid ?? ""), { type: "USER", id: user.id });
  // Try right away; the worker keeps retrying if the chain isn't final yet.
  try {
    await notifyMatchEvents(await verifySubmittedTxid(id));
  } catch {
    /* provider issue: worker will retry */
  }
  return { redirect: `/orders/${id}` };
});
