import { api, body } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { addPayoutMethod } from "@/server/payouts";

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const b = await body<Record<string, string>>(req);
  const pm = await addPayoutMethod(
    user.id,
    { type: b.type as "BANK" | "UPI", holderName: b.holderName ?? "", accountNumber: b.accountNumber, accountNumberConfirm: b.accountNumberConfirm, ifsc: b.ifsc, upiId: b.upiId },
    { type: "USER", id: user.id },
  );
  return { redirect: "/payout-methods", message: pm.status === "APPROVED" ? "Saved and approved. You can sell now." : "Saved. We'll review it shortly." };
});
