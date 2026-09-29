import { ListOrdered } from "lucide-react";
import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtInr, fmtUsdt } from "@/server/money";
import { ALLOWED_NEXT } from "@/server/orders/stateMachine";
import { fmtIST } from "@/lib/time";
import { NetworkBadge, PageHeader, StatusPill, statusLabel } from "@/components/ui";

const WORK: OrderStatus[] = ["PAYMENT_CONFIRMED", "UNDER_REVIEW"];

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await adminOrLogin();
  const { status, q } = await searchParams;
  const all = Object.keys(ALLOWED_NEXT) as OrderStatus[];
  const chosen = all.includes(status as OrderStatus) ? [status as OrderStatus] : status === "ALL" ? all : WORK;
  const orders = await prisma.order.findMany({
    where: { status: { in: chosen }, ...(q ? { OR: [{ id: { contains: q.trim(), mode: "insensitive" } }, { txid: q.trim().toLowerCase() }, { submittedTxid: q.trim().toLowerCase() }, { utr: q.trim().toUpperCase() }, { user: { email: { contains: q.trim(), mode: "insensitive" } } }] } : {}) },
    orderBy: { createdAt: "asc" },
    include: { user: true },
    take: 300,
  });
  const tab = (key: string, label: string, active: boolean) => (
    <Link key={key} href={`/admin/orders?status=${key}`} className={`rounded-full px-3 py-1 text-sm ring-1 ${active ? "bg-slate-900 text-white" : "bg-white ring-slate-300"}`}>{label}</Link>
  );
  return (
    <div className="space-y-4">
      <PageHeader title="Orders" icon={<ListOrdered className="size-6" />} />
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/orders" className={`rounded-full px-3 py-1 text-sm ring-1 ${!status ? "bg-slate-900 text-white" : "bg-white ring-slate-300"}`}>Work waiting</Link>
        {all.map((s) => tab(s, statusLabel(s), status === s))}
        {tab("ALL", "All", status === "ALL")}
      </div>
      <form className="flex gap-2">
        <input type="hidden" name="status" value={status ?? "ALL"} />
        <input name="q" defaultValue={q} className="input max-w-md" placeholder="Order ID, TxID, UTR or email" />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card overflow-x-auto">
        {orders.length === 0 ? <p className="muted">No orders.</p> : (
          <table className="table">
            <thead><tr><th>Order</th><th>Created</th><th>User</th><th>USDT</th><th>Net ₹</th><th>Status</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link className="font-medium text-brand-700 underline" href={`/admin/orders/${o.id}`}>{o.id}</Link></td>
                  <td>{fmtIST(o.createdAt)}</td>
                  <td>{o.user.email}</td>
                  <td>{fmtUsdt(o.usdtAmount)} <NetworkBadge network={o.network} /></td>
                  <td>{fmtInr(o.net)}</td>
                  <td><StatusPill status={o.status} />{o.holdReason && o.status === "ON_HOLD" && <div className="text-xs text-orange-800">{o.holdReason}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
