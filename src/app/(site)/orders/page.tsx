import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtInr, fmtUsdt } from "@/server/money";
import { fmtIST } from "@/lib/time";
import { NetworkBadge, StatusPill, statusLabel } from "@/components/ui";
import { ALLOWED_NEXT } from "@/server/orders/stateMachine";

export const metadata = { title: "My orders" };

export default async function Orders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await userOrLogin();
  const { status } = await searchParams;
  const statuses = Object.keys(ALLOWED_NEXT) as OrderStatus[];
  const filter = statuses.includes(status as OrderStatus) ? (status as OrderStatus) : undefined;
  const orders = await prisma.order.findMany({ where: { userId: user.id, ...(filter ? { status: filter } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <div className="space-y-4">
      <h1 className="h1">My orders</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/orders" className={`rounded-full px-3 py-1 ring-1 ${!filter ? "bg-gray-900 text-white" : "ring-gray-300"}`}>All</Link>
        {statuses.map((s) => (
          <Link key={s} href={`/orders?status=${s}`} className={`rounded-full px-3 py-1 ring-1 ${filter === s ? "bg-gray-900 text-white" : "ring-gray-300"}`}>{statusLabel(s)}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto p-0 sm:p-0">
        {orders.length === 0 ? <p className="muted p-4">No orders.</p> : (
          <table className="table">
            <thead><tr><th>Date</th><th>USDT</th><th>You get</th><th>Status</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link className="text-brand-700 underline" href={`/orders/${o.id}`}>{fmtIST(o.createdAt)}</Link><div className="text-xs text-gray-400">{o.id}</div></td>
                  <td>{fmtUsdt(o.usdtAmount)}<div><NetworkBadge network={o.network} /></div></td>
                  <td>{fmtInr(o.net)}</td>
                  <td><StatusPill status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
