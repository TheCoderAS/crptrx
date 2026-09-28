import { api, body } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { deletePayoutMethod, setDefaultPayoutMethod } from "@/server/payouts";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { action } = await body<{ action: string }>(req);
  if (action === "delete") await deletePayoutMethod(user.id, id, { type: "USER", id: user.id });
  else await setDefaultPayoutMethod(user.id, id);
  return {};
});
