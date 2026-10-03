import Link from "next/link";
import { InfoTip } from "@/components/InfoTip";
import type { PayoutMethod } from "@prisma/client";
import { CheckCircle2, Clock, Landmark, Smartphone, XCircle } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { MAX_PAYOUT_METHODS } from "@/server/payouts";
import { getSettings } from "@/server/settings";
import { ApiForm } from "@/components/ApiForm";
import { BackLink, Banner, PageHeader, StatusPill } from "@/components/ui";
import { AddPayoutMethod } from "@/components/PayoutMethodForm";

export const metadata = { title: "Bank & UPI", robots: { index: false, follow: false } };

const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

export default async function PayoutMethods({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const user = await userOrLogin();
  const [methods, s, { add }] = await Promise.all([
    prisma.payoutMethod.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    getSettings(),
    searchParams,
  ]);
  const declined = user.kycStatus === "DECLINED";
  const canAdd = !declined && (!s.kyc_required || user.kycStatus === "APPROVED") && methods.length < MAX_PAYOUT_METHODS;
  return (
    <div className="space-y-6">
      <BackLink href="/account">Account</BackLink>
      <PageHeader
        title="Bank & UPI"
        subtitle="Payouts go only to accounts in your own name."
        icon={<Landmark className="size-6" />}
        tile="tile-emerald"
        action={canAdd && methods.length > 0 ? <AddPayoutMethod kycRequired={s.kyc_required} /> : undefined}
      />
      {declined && <Banner tone="danger">Your identity check was declined, so you can&apos;t add payout methods.</Banner>}
      {!declined && s.kyc_required && user.kycStatus !== "APPROVED" && <Banner tone="warn">Finish your <Link className="font-medium underline" href="/kyc">identity check</Link> first.</Banner>}

      {methods.length === 0 ? (
        canAdd && (
          <div className="card flex flex-col items-center px-6 py-10 text-center">
            <span className="icon-tile tile-emerald size-12 rounded-2xl"><Landmark className="size-6" aria-hidden /></span>
            <h2 className="h2 mt-4">Where should we pay you?</h2>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">Bank account or UPI ID in your name <InfoTip>We check it once, then every payout goes there.</InfoTip></p>
            <div className="mt-5"><AddPayoutMethod kycRequired={s.kyc_required} autoOpen={add === "1"} /></div>
          </div>
        )
      ) : (
        <ul className="space-y-3">
          {methods.map((m) => <MethodCard key={m.id} m={m} kycRequired={s.kyc_required} />)}
        </ul>
      )}

      {methods.length >= MAX_PAYOUT_METHODS && <p className="muted">You can save up to {MAX_PAYOUT_METHODS} payout methods. Remove one to add another.</p>}
    </div>
  );
}

function MethodCard({ m, kycRequired }: { m: PayoutMethod; kycRequired: boolean }) {
  const bank = m.type === "BANK";
  const [upiName, upiHost] = (m.upiId ?? "").split("@");
  const details: [string, string][] = bank
    ? [["Account holder", m.holderName], ["IFSC", m.ifsc ?? "—"], ["Added", dateFmt.format(m.createdAt)]]
    : [["Account holder", m.holderName], ["UPI app / bank", upiHost ? `@${upiHost}` : "—"], ["Added", dateFmt.format(m.createdAt)]];
  const note =
    m.status === "PENDING"
      ? { Icon: Clock, cls: "text-amber-700", text: `We're checking ${kycRequired ? "the name matches your ID" : "this account"}. Usually within a few hours.` }
      : m.status === "DECLINED"
        ? { Icon: XCircle, cls: "text-rose-700", text: m.reason ? `Declined: ${m.reason}` : "Declined. Add a different account." }
        : { Icon: CheckCircle2, cls: "text-emerald-700", text: m.isDefault ? "Payouts go here." : "Ready to use." };
  return (
    <li className="card overflow-hidden p-0">
      <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
        <span className={`icon-tile ${bank ? "tile-emerald" : "tile-violet"}`}>
          {bank ? <Landmark className="size-5" aria-hidden /> : <Smartphone className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-slate-500">{bank ? "Bank account" : "UPI ID"}</p>
            {m.isDefault && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">Default</span>}
          </div>
          <p className="mt-0.5 truncate font-mono text-lg font-semibold tracking-wide text-slate-900">
            {bank ? `•••• •••• ${m.accountLast4 ?? "••••"}` : `${upiName.slice(0, 2)}${"•".repeat(Math.max(upiName.length - 2, 2))}@${upiHost ?? ""}`}
          </p>
        </div>
        <StatusPill status={m.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 px-4 py-3 sm:grid-cols-3 sm:px-5">
        {details.map(([k, v], i) => (
          <div key={k} className={`min-w-0 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`}>
            <dt className="text-xs text-slate-500">{k}</dt>
            <dd className={`truncate text-sm font-medium text-slate-900 ${k === "IFSC" ? "font-mono" : ""}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 sm:px-5">
        <p className={`flex min-w-0 flex-1 items-center gap-1.5 text-xs ${note.cls}`}>
          <note.Icon className="size-3.5 shrink-0" aria-hidden />
          <span>{note.text}</span>
        </p>
        <div className="flex gap-1">
          {!m.isDefault && m.status === "APPROVED" && (
            <ApiForm action={`/api/payout-methods/${m.id}`}><input type="hidden" name="action" value="default" /><button className="btn-ghost min-h-9 px-3 text-xs">Make default</button></ApiForm>
          )}
          <ApiForm action={`/api/payout-methods/${m.id}`} confirm="Remove this payout method? Past orders keep their details.">
            <input type="hidden" name="action" value="delete" />
            <button className="btn-ghost min-h-9 px-3 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700">Remove</button>
          </ApiForm>
        </div>
      </div>
    </li>
  );
}
