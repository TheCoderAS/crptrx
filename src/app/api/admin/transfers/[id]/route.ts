import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { AppError } from "@/server/errors";
import { linkTransferToOrder, markTransferManual } from "@/server/orders/actions";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  const b = await body<Record<string, string>>(req);
  if (b.action === "link") await linkTransferToOrder(id, String(b.orderId ?? "").trim(), b.note, a.actor);
  else if (b.action === "manual") await markTransferManual(id, b.note, a.actor);
  else throw new AppError("Unknown action");
  return {};
});
