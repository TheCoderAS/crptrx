import { api, body } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { addWallet } from "@/server/wallets";

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const b = await body<{ network: string; address: string; label?: string }>(req);
  await addWallet(user.id, b, { type: "USER", id: user.id });
  return { redirect: "/wallets", message: "Wallet added." };
});
