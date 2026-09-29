import { api } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { removeWallet } from "@/server/wallets";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = api(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await removeWallet(user.id, id, { type: "USER", id: user.id });
  return {};
});
