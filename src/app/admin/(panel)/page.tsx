import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { D, fmtInr, fmtUsdt } from "@/server/money";
import { istDayStart } from "@/lib/time";
import { StatusPill } from "@/components/ui";

export default async function Dashboard() {
  await adminOrLogin();
  const today = istDayStart();
  const [kyc, pms, byStatus, received, paid, unmatched, support, watchers] = await Promise.all([
    prisma.kycSubmission.count({ where: { status: "SUBMITTED" } }),
    prisma.payoutMethod.count({ where: { status: "PENDING", deletedAt: null } }),
    prisma.order.groupBy({ by: ["status"], _count: true }),
    prisma.order.aggregate({ _sum: { receivedAmount: true }, where: { confirmedAt: { gte: today } } }),
    prisma.order.aggregate({ _sum: { paidAmount: true, taxHeld: true }, where: { status: "PAID", paidAt: { gte: today } } }),
    prisma.incomingTransfer.count({ where: { status: "UNMATCHED" } }),
    prisma.supportMessage.count({ where: { handled: false } }),
    prisma.watcherState.findMany(),
  ]);
  const count = (s: OrderStatus) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const tile = (label: string, value: React.ReactNode, href?: string) => (
    <div className="card">
      <p className="muted">{label}</p>
      <p className="text-2xl font-bold">{href ? <Link href={href} className="hover:underline">{value}</Link> : value}</p>
    </div>
  );
  return (
    <div className="space-y-6">
      <h1 className="h1">Dashboard</h1>
      <div className="grid gap-3 sm:grid-cols-4">
        {tile("KYC waiting", kyc, "/admin/kyc")}
        {tile("Payout methods waiting", pms, "/admin/payout-methods")}
        {tile("Unmatched payments", unmatched, "/admin/unmatched")}
        {tile("Open support messages", support, "/admin/support")}
      </div>
      <div>
        <h2 className="h2 mb-2">Today (IST)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {tile("USDT received", fmtUsdt(D(received._sum.receivedAmount ?? 0)))}
          {tile("Rupees paid", fmtInr(D(paid._sum.paidAmount ?? 0)))}
          {tile("Tax held back (paid orders)", fmtInr(D(paid._sum.taxHeld ?? 0)))}
        </div>
      </div>
      <div className="card">
        <h2 className="h2 mb-3">Orders by status</h2>
        <div className="flex flex-wrap gap-3">
          {(["QUOTE_READY", "PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED", "UNDER_REVIEW", "ON_HOLD", "APPROVED", "PAID", "EXPIRED", "CLOSED_MANUAL"] as OrderStatus[]).map((s) => (
            <Link key={s} href={`/admin/orders?status=${s}`} className="flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ring-gray-200 hover:bg-gray-50">
              <StatusPill status={s} /> <b>{count(s)}</b>
            </Link>
          ))}
        </div>
      </div>
      <div className="card">
        <h2 className="h2 mb-2">Blockchain checks</h2>
        {watchers.length === 0 ? <p className="muted">The worker hasn&apos;t run yet.</p> : (
          <table className="table">
            <thead><tr><th>Network</th><th>Last success</th><th>Last error</th></tr></thead>
            <tbody>
              {watchers.map((w) => (
                <tr key={w.network}><td>{w.network}</td><td>{w.lastSuccessAt?.toISOString() ?? "never"}</td><td className="text-red-700">{w.failingSince ? `${w.lastError} (since ${w.failingSince.toISOString()})` : ""}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
