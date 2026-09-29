import Link from "next/link";
import { Landmark, Smartphone } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { MAX_PAYOUT_METHODS, maskedPayout } from "@/server/payouts";
import { ApiForm } from "@/components/ApiForm";
import { Banner, PageHeader, StatusPill } from "@/components/ui";
import { PayoutMethodForm } from "@/components/PayoutMethodForm";

export const metadata = { title: "Bank & UPI", robots: { index: false, follow: false } };

export default async function PayoutMethods() {
  const user = await userOrLogin();
  const methods = await prisma.payoutMethod.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Bank & UPI" subtitle="Payouts go only to accounts in your own name." icon={<Landmark className="size-6" />} tile="tile-emerald" />
      {user.kycStatus !== "APPROVED" && <Banner tone="warn">Finish your <Link className="font-medium underline" href="/kyc">identity check</Link> first.</Banner>}

      {methods.length > 0 && (
        <ul className="space-y-3">
          {methods.map((m) => (
            <li key={m.id} className="card flex flex-wrap items-center gap-4 p-4 sm:p-5">
              <span className={`icon-tile ${m.type === "BANK" ? "tile-emerald" : "tile-violet"}`}>
                {m.type === "BANK" ? <Landmark className="size-5" aria-hidden /> : <Smartphone className="size-5" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-900">{maskedPayout(m)}</p>
                  {m.isDefault && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">Default</span>}
                </div>
                <p className="text-sm text-slate-500">{m.holderName}</p>
                {m.status === "PENDING" && <p className="mt-1 text-xs text-slate-500">We&apos;re checking the name matches your ID. Usually within a few hours.</p>}
                {m.status === "DECLINED" && m.reason && <p className="mt-1 text-xs text-rose-700">Declined: {m.reason}</p>}
              </div>
              <div className="flex items-center gap-1">
                <StatusPill status={m.status} />
                {!m.isDefault && m.status === "APPROVED" && (
                  <ApiForm action={`/api/payout-methods/${m.id}`}><input type="hidden" name="action" value="default" /><button className="btn-ghost px-3 py-1.5 text-xs">Make default</button></ApiForm>
                )}
                <ApiForm action={`/api/payout-methods/${m.id}`} confirm="Remove this payout method? Past orders keep their details.">
                  <input type="hidden" name="action" value="delete" />
                  <button className="btn-ghost px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700">Remove</button>
                </ApiForm>
              </div>
            </li>
          ))}
        </ul>
      )}

      {user.kycStatus === "APPROVED" && methods.length < MAX_PAYOUT_METHODS && <PayoutMethodForm first={methods.length === 0} />}
      {methods.length >= MAX_PAYOUT_METHODS && <p className="muted">You can save up to {MAX_PAYOUT_METHODS} payout methods. Remove one to add another.</p>}
    </div>
  );
}
