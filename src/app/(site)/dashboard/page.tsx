import Link from "next/link";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtInr, fmtUsdt } from "@/server/money";
import { NetworkBadge, StatusPill } from "@/components/ui";
import { fmtIST } from "@/lib/time";

export const metadata = { title: "Home" };

export default async function Dashboard() {
  const user = await userOrLogin();
  const [approvedPm, orders] = await Promise.all([
    prisma.payoutMethod.count({ where: { userId: user.id, status: "APPROVED", deletedAt: null } }),
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const steps = [
    { done: !!user.mobileVerifiedAt, label: "Confirm your mobile number", href: "/account" },
    { done: user.kycStatus === "APPROVED", label: user.kycStatus === "SUBMITTED" ? "Identity check: under review" : "Complete your identity check", href: "/kyc" },
    { done: approvedPm > 0, label: "Add a bank account or UPI ID", href: "/payout-methods" },
  ];
  const ready = steps.every((s) => s.done);
  return (
    <div className="space-y-6">
      <h1 className="h1">Hello{user.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}</h1>
      {!ready && (
        <div className="card space-y-3">
          <h2 className="h2">Before you can sell</h2>
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-green-600 text-white" : "bg-gray-200"}`}>{s.done ? "✓" : ""}</span>
                {s.done ? <span className="text-gray-500 line-through">{s.label}</span> : <Link className="font-medium text-brand-700 underline" href={s.href}>{s.label}</Link>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {ready && <Link href="/sell" className="btn-primary w-full py-4 text-base">Sell USDT</Link>}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="h2">Recent orders</h2>
          <Link href="/orders" className="text-sm text-brand-700">All orders</Link>
        </div>
        {orders.length === 0 ? <p className="muted">No orders yet.</p> : (
          <ul className="divide-y divide-gray-100">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{fmtUsdt(o.usdtAmount)} USDT → {fmtInr(o.net)}</p>
                    <p className="text-xs text-gray-500">{o.id} · {fmtIST(o.createdAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1"><StatusPill status={o.status} /><NetworkBadge network={o.network} /></div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
