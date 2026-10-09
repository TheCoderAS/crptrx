import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { AppError } from "@/server/errors";
import { isSuper } from "@/server/scope";
import { cancelPayoutRequest, declinePayoutRequest } from "@/server/payoutRequests";

type Ctx = { params: Promise<{ id: string }> };

/** The admin cancels their own waiting request; a super admin declines one (reason shown to the admin). */
export const POST = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  const b = await body<{ action?: string; reason?: string }>(req);
  if (b.action === "cancel") {
    await cancelPayoutRequest(a.admin.id, id, a.actor);
    return { message: "Request cancelled." };
  }
  if (b.action === "decline") {
    if (!isSuper(a.admin)) throw new AppError("Not found", 404, "NOT_FOUND");
    await declinePayoutRequest(id, b.reason, a.actor);
    return { message: "Declined. The admin can see why." };
  }
  throw new AppError("Unknown action");
});
