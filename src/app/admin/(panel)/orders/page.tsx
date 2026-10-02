import { ListOrdered } from "lucide-react";
import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtInr, fmtUsdt } from "@/server/money";
import { ALLOWED_NEXT } from "@/server/orders/stateMachine";
import { fmtIST } from "@/lib/time";
import { FilterMenu } from "@/components/FilterMenu";
import { NetworkBadge, PageHeader, StatusPill, statusLabel } from "@/components/ui";

// Everything waiting on an admin: new payments, reviews, holds and approved orders still to be paid.
const WORK: OrderStatus[] = ["PAYMENT_CONFIRMED", "UNDER_REVIEW", "ON_HOLD", "APPROVED"];
const PER_PAGE = 50;

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  await adminOrLogin();
  const { status, q, page } = await searchParams;
  const all = Object.keys(ALLOWED_NEXT) as OrderStatus[];
  const chosen = all.includes(status as OrderStatus) ? [status as OrderStatus] : status === "ALL" ? all : WORK;
  const queue = !status; // the work queue is oldest first; every other list newest first
  const where = { status: { in: chosen }, ...(q ? { OR: [{ id: { contains: q.trim(), mode: "insensitive" as const } }, { txid: q.trim().toLowerCase() }, { submittedTxid: q.trim().toLowerCase() }, { utr: q.trim().toUpperCase() }, { user: { email: { contains: q.trim(), mode: "insensitive" as const } } }] } : {}) };
  const pageNo = Math.max(1, Number(page) || 1);
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: queue ? "asc" : "desc" }, include: { user: true }, skip: (pageNo - 1) * PER_PAGE, take: PER_PAGE }),
    prisma.order.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageHref = (n: number) => `/admin/orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), page: String(n) })}`;
  return (
    <div className="space-y-4">
      <PageHeader title="Orders" subtitle={queue ? "Waiting on you, oldest first." : `${total} order${total === 1 ? "" : "s"}, newest first.`} icon={<ListOrdered className="size-6" />} />
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex min-w-0 flex-1 gap-2">
          <input type="hidden" name="status" value={status ?? "ALL"} />
          <input name="q" defaultValue={q} aria-label="Search orders" className="input max-w-md" placeholder="Order ID, TxID, UTR or email" />
          <button className="btn-secondary">Search</button>
        </form>
        <FilterMenu
          items={[
            { href: "/admin/orders", label: "Work waiting", active: !status },
            { href: "/admin/orders?status=ALL", label: "All orders", active: status === "ALL" },
            ...all.map((s) => ({ href: `/admin/orders?status=${s}`, label: statusLabel(s), active: status === s })),
          ]}
        />
      </div>
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
      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pages">
          {pageNo > 1 ? <Link href={pageHref(pageNo - 1)} className="btn-secondary">Previous</Link> : <span />}
          <span className="muted">Page {pageNo} of {pages}</span>
          {pageNo < pages ? <Link href={pageHref(pageNo + 1)} className="btn-secondary">Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
