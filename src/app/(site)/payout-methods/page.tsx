import Link from "next/link";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { MAX_PAYOUT_METHODS, maskedPayout } from "@/server/payouts";
import { ApiForm } from "@/components/ApiForm";
import { Banner, StatusPill } from "@/components/ui";
import { PayoutMethodForm } from "@/components/PayoutMethodForm";

export const metadata = { title: "Payout methods" };

export default async function PayoutMethods() {
  const user = await userOrLogin();
  const methods = await prisma.payoutMethod.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: "asc" } });
  return (
    <div className="space-y-6">
      <h1 className="h1">Bank account / UPI</h1>
      <Banner>Payouts go only to accounts in your own name. We check the name against your identity check before you can use it.</Banner>
      {user.kycStatus !== "APPROVED" && <Banner tone="warn">Finish your <Link className="underline" href="/kyc">identity check</Link> first.</Banner>}
      <div className="space-y-3">
        {methods.map((m) => (
          <div key={m.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{maskedPayout(m)}</p>
              <p className="muted">{m.holderName}{m.isDefault ? " · Default" : ""}</p>
              {m.status === "DECLINED" && m.reason && <p className="text-sm text-red-700">Declined: {m.reason}</p>}
              {m.status === "PENDING" && <p className="text-sm text-gray-500">Pending review</p>}
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status={m.status} />
              {!m.isDefault && m.status === "APPROVED" && (
                <ApiForm action={`/api/payout-methods/${m.id}`}><input type="hidden" name="action" value="default" /><button className="btn-secondary px-3 py-1.5">Make default</button></ApiForm>
              )}
              <ApiForm action={`/api/payout-methods/${m.id}`} confirm="Remove this payout method? Past orders keep their details."><input type="hidden" name="action" value="delete" /><button className="btn-secondary px-3 py-1.5">Remove</button></ApiForm>
            </div>
          </div>
        ))}
      </div>
      {user.kycStatus === "APPROVED" && methods.length < MAX_PAYOUT_METHODS && <PayoutMethodForm />}
      {methods.length >= MAX_PAYOUT_METHODS && <p className="muted">You can save up to {MAX_PAYOUT_METHODS} payout methods.</p>}
    </div>
  );
}
