import { ListOrdered } from "lucide-react";
import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtInr, fmtUsdt } from "@/server/money";
import { ALLOWED_NEXT } from "@/server/orders/stateMachine";
import { fmtIST } from "@/lib/time";
import { pickSort } from "@/lib/sort";
import { ListToolbar } from "@/components/ListToolbar";
import { FilterMenu } from "@/components/FilterMenu";
import { NetworkBadge, PageHeader, StatusPill, statusLabel } from "@/components/ui";

// Everything waiting on an admin: new payments, reviews, holds and approved orders still to be paid.
const WORK: OrderStatus[] = ["PAYMENT_CONFIRMED", "UNDER_REVIEW", "ON_HOLD", "APPROVED"];
const PER_PAGE = 50;
const SORTS = [
  { value: "old", label: "Oldest first" },
  { value: "new", label: "Newest first" },
  { value: "high", label: "Amount: high to low" },
  { value: "low", label: "Amount: low to high" },
] as const;
type Sort = (typeof SORTS)[number]["value"];
const ORDER_BY: Record<Sort, Prisma.OrderOrderByWithRelationInput> = { new: { createdAt: "desc" }, old: { createdAt: "asc" }, high: { usdtAmount: "desc" }, low: { usdtAmount: "asc" } };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string }> }) {
  await adminOrLogin();
  const { status, q, page, sort: sortParam } = await searchParams;
  const all = Object.keys(ALLOWED_NEXT) as OrderStatus[];
  const chosen = all.includes(status as OrderStatus) ? [status as OrderStatus] : status === "ALL" || q?.trim() ? all : WORK; // a search looks through every order
  const queue = !status && !q?.trim(); // the work queue is oldest first; every other list newest first
  const defaultSort: Sort = queue ? "old" : "new";
  const sort = pickSort(sortParam, SORTS.map((s) => s.value), defaultSort);
  const where = { status: { in: chosen }, ...(q ? { OR: [{ id: { contains: q.trim(), mode: "insensitive" as const } }, { txid: q.trim().toLowerCase() }, { submittedTxid: q.trim().toLowerCase() }, { utr: q.trim().toUpperCase() }, { user: { email: { contains: q.trim(), mode: "insensitive" as const } } }] } : {}) };
  const pageNo = Math.max(1, Number(page) || 1);
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: [ORDER_BY[sort], { createdAt: "asc" }], include: { user: true }, skip: (pageNo - 1) * PER_PAGE, take: PER_PAGE }),
    prisma.order.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageHref = (n: number) => `/admin/orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), ...(sortParam ? { sort } : {}), page: String(n) })}`;
  const statusHref = (s?: string) => `/admin/orders?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) })}`;
  return (
    <div className="space-y-4">
      <PageHeader title="Orders" subtitle={queue ? `Waiting on you: ${total} order${total === 1 ? "" : "s"}.` : `${total} order${total === 1 ? "" : "s"}.`} icon={<ListOrdered className="size-6" />} />
      <ListToolbar placeholder="Order ID, TxID, UTR or email" sorts={[...SORTS]} defaultSort={defaultSort}>
        <FilterMenu
          items={[
            { href: statusHref(), label: "Work waiting", active: queue },
            { href: statusHref("ALL"), label: "All orders", active: status === "ALL" || (!status && !queue) },
            ...all.map((s) => ({ href: statusHref(s), label: statusLabel(s), active: status === s })),
          ]}
        />
      </ListToolbar>
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
