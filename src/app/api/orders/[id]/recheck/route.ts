import { api } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { recheckPayment } from "@/server/matching";
import { notifyMatchEvents } from "@/server/notify";
import { rateLimit } from "@/server/ratelimit";

type Ctx = { params: Promise<{ id: string }> };

/** The customer's "Re-check payment" button: look their TxID up on the blockchain again. */
export const POST = api(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await rateLimit(`recheck:${user.id}`, 6, 10 * 60);
  await notifyMatchEvents(await recheckPayment(id, { type: "USER", id: user.id }, user.id));
  return { redirect: `/orders/${id}` };
});
