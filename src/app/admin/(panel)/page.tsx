import { AlertOctagon, BadgeCheck, Banknote, Gauge, Landmark, LifeBuoy, Percent, Wallet } from "lucide-react";
import { adminCounts } from "@/server/adminCounts";
import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { D, fmtInr, fmtUsdt } from "@/server/money";
import { isSuper, ownedScope } from "@/server/scope";
import { fmtIST, istDayStart } from "@/lib/time";
import { PageHeader, Section, Stat, StatusPill } from "@/components/ui";

export default async function Dashboard() {
  const me = await adminOrLogin();
  const sup = isSuper(me);
  const mine = ownedScope(me);
  const today = istDayStart();
  const [{ kyc, payout: pms, unmatched, support, toPay }, byStatus, received, paid, watchers] = await Promise.all([
    adminCounts(me),
    prisma.order.groupBy({ by: ["status"], _count: true, where: mine }),
    prisma.order.aggregate({ _sum: { receivedAmount: true }, where: { confirmedAt: { gte: today }, ...mine } }),
    prisma.order.aggregate({ _sum: { paidAmount: true, taxHeld: true }, where: { status: "PAID", paidAt: { gte: today }, ...mine } }),
    prisma.watcherState.findMany(),
  ]);
  const count = (s: OrderStatus) => byStatus.find((b) => b.status === s)?._count ?? 0;
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={sup ? "What needs attention today." : "Your customers: what needs attention today."} icon={<Gauge className="size-6" />} />
      {sup && toPay > 0 && (
        <div>
          <p className="eyebrow mb-3">Waiting for you</p>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Stat label="Approved orders to pay" value={toPay} href="/admin/orders?status=APPROVED" icon={<Banknote className="size-5" />} tile="tile-emerald" />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="KYC waiting" value={kyc} href="/admin/reviews?tab=kyc" icon={<BadgeCheck className="size-5" />} tile="tile-violet" />
        <Stat label="Payout methods waiting" value={pms} href="/admin/reviews?tab=payout" icon={<Landmark className="size-5" />} tile="tile-emerald" />
        {sup && <Stat label="Unmatched payments" value={unmatched} href="/admin/unmatched?show=waiting" icon={<AlertOctagon className="size-5" />} tile="tile-amber" />}
        <Stat label="Open support messages" value={support} href="/admin/support?open=1" icon={<LifeBuoy className="size-5" />} tile="tile-rose" />
      </div>
      <div>
        <p className="eyebrow mb-3">Today (IST)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <Stat label="USDT received" value={fmtUsdt(D(received._sum.receivedAmount ?? 0))} icon={<Wallet className="size-5" />} />
          <Stat label="Rupees paid" value={fmtInr(D(paid._sum.paidAmount ?? 0))} icon={<Banknote className="size-5" />} tile="tile-emerald" />
          <Stat label="Tax held back (paid orders)" value={fmtInr(D(paid._sum.taxHeld ?? 0))} icon={<Percent className="size-5" />} tile="tile-violet" className="col-span-2 sm:col-span-1" />
        </div>
      </div>
      <Section title="Orders by status">
        <div className="flex flex-wrap gap-2">
          {(["QUOTE_READY", "PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED", "UNDER_REVIEW", "ON_HOLD", "APPROVED", "PAID", "EXPIRED", "CLOSED_MANUAL"] as OrderStatus[]).map((s) => (
            <Link key={s} href={`/admin/orders?status=${s}`} className="flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-slate-200 transition hover:bg-slate-50">
              <StatusPill status={s} /> <b className="tabular-nums">{count(s)}</b>
            </Link>
          ))}
        </div>
      </Section>
      <Section title="Blockchain checks">
        {watchers.length === 0 ? <p className="muted">The worker hasn&apos;t run yet.</p> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Network</th><th>Last success</th><th>Problem</th></tr></thead>
              <tbody>
                {watchers.map((w) => (
                  <tr key={w.network}>
                    <td className="font-medium">{w.network}</td>
                    <td>{w.lastSuccessAt ? fmtIST(w.lastSuccessAt) : "never"}</td>
                    <td className="text-rose-700">{w.failingSince ? `${w.lastError} (since ${fmtIST(w.failingSince)})` : <span className="text-emerald-700">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
