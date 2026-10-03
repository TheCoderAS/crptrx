import { ListOrdered } from "lucide-react";
import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtInr, fmtUsdt } from "@/server/money";
import { ALLOWED_NEXT } from "@/server/orders/stateMachine";
import { fmtISTShort } from "@/lib/time";
import { pickSort } from "@/lib/sort";
import { ListToolbar } from "@/components/ListToolbar";
import { FilterMenu } from "@/components/FilterMenu";
import { NetworkMark, PageHeader, StatusPill, statusLabel } from "@/components/ui";

// Everything waiting on an admin: new payments, reviews, holds and approved orders still to be paid.
const WORK: OrderStatus[] = ["PAYMENT_CONFIRMED", "UNDER_REVIEW", "ON_HOLD", "APPROVED"];
// Every order not finished yet, including ones not paid yet.
const ACTIVE: OrderStatus[] = ["QUOTE_READY", "PAYMENT_SUBMITTED", ...WORK];
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
  const searching = !!q?.trim();
  // Default: every order. A search also looks through every order.
  const chosen = searching ? all : all.includes(status as OrderStatus) ? [status as OrderStatus] : status === "WORK" ? WORK : status === "ACTIVE" ? ACTIVE : all;
  const active = status === "ACTIVE" && !searching;
  const queue = status === "WORK" && !searching; // the "needs action" queue is oldest first; every other list newest first
  const defaultSort: Sort = queue ? "old" : "new";
  const sort = pickSort(sortParam, SORTS.map((s) => s.value), defaultSort);
  const where = { status: { in: chosen }, ...(q ? { OR: [{ id: { contains: q.trim(), mode: "insensitive" as const } }, { txid: q.trim().toLowerCase() }, { submittedTxid: q.trim().toLowerCase() }, { utr: q.trim().toUpperCase() }, { user: { email: { contains: q.trim(), mode: "insensitive" as const } } }] } : {}) };
  const pageNo = Math.max(1, Number(page) || 1);
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: [ORDER_BY[sort], { createdAt: "asc" }], include: { user: true }, skip: (pageNo - 1) * PER_PAGE, take: PER_PAGE }),
    prisma.order.count({ where }),
  ]);
  // Orders without a payment that an unmatched payment could belong to (same TxID, or same network + exact amount).
  const waiting = orders.filter((o) => !o.txid && ["QUOTE_READY", "EXPIRED", "PAYMENT_SUBMITTED", "ON_HOLD"].includes(o.status));
  const loose = waiting.length
    ? await prisma.incomingTransfer.findMany({
        where: { status: { in: ["UNMATCHED", "MANUAL_HANDLING"] }, blockTime: { gte: new Date(Date.now() - 8 * 86400_000) }, OR: waiting.flatMap((o) => [{ network: o.network, amount: o.usdtAmount }, ...(o.submittedTxid ? [{ txid: o.submittedTxid }] : [])]) },
        select: { network: true, amount: true, txid: true, blockTime: true },
      })
    : [];
  const maybePaid = (o: (typeof orders)[number]) =>
    waiting.includes(o) && loose.some((t) => (o.submittedTxid && t.txid.toLowerCase() === o.submittedTxid.toLowerCase()) || (t.network === o.network && fmtUsdt(t.amount) === fmtUsdt(o.usdtAmount) && t.blockTime.getTime() >= o.createdAt.getTime() - 3600_000));
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageHref = (n: number) => `/admin/orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), ...(sortParam ? { sort } : {}), page: String(n) })}`;
  const statusHref = (s?: string) => `/admin/orders?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) })}`;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders"
        subtitle={active ? `${total} in progress, including unpaid.` : queue ? `Waiting on you: ${total} order${total === 1 ? "" : "s"}.` : `${total} order${total === 1 ? "" : "s"}.`}
        icon={<ListOrdered className="size-6" />}
      />
      <ListToolbar placeholder="Order ID, TxID, UTR or email" sorts={[...SORTS]} defaultSort={defaultSort}>
        <FilterMenu
          items={[
            { href: statusHref(), label: "All orders", active: !status || searching },
            { href: statusHref("ACTIVE"), label: "In progress", active },
            { href: statusHref("WORK"), label: "Needs action", active: queue },
            ...all.map((s) => ({ href: statusHref(s), label: statusLabel(s), active: status === s })),
          ]}
        />
      </ListToolbar>
      <div className="card overflow-hidden p-0 sm:p-0">
        {orders.length === 0 ? <p className="muted p-5">No orders.</p> : (
          <>
            {/* Phones: one tappable card per order. */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="block space-y-1 px-4 py-3 active:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-500">{o.id}</span>
                      <StatusPill status={o.status} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900"><NetworkMark network={o.network} size={16} />{fmtUsdt(o.usdtAmount)} USDT</span>
                      <span className="font-semibold text-slate-900">{fmtInr(o.net)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="min-w-0 truncate">{o.user.email}</span>
                      <span className="shrink-0">{fmtISTShort(o.createdAt)}</span>
                    </div>
                    {o.status === "ON_HOLD" && o.holdReason && <p className="truncate text-xs text-amber-700">{o.holdReason}</p>}
                    {maybePaid(o) && <span className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300">Possible payment found</span>}
                  </Link>
                </li>
              ))}
            </ul>
            {/* Desktop: compact table; the whole row opens the order. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="table">
                <thead><tr><th>Order</th><th>Customer</th><th className="text-right">USDT</th><th className="text-right">Pays</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="relative hover:bg-slate-50">
                      <td className="whitespace-nowrap"><Link className="font-mono text-xs font-medium text-brand-700 after:absolute after:inset-0" href={`/admin/orders/${o.id}`}>{o.id}</Link></td>
                      <td className="max-w-56 truncate text-slate-600">{o.user.email}</td>
                      <td className="whitespace-nowrap text-right"><span className="inline-flex items-center gap-1.5 font-medium">{fmtUsdt(o.usdtAmount)}<NetworkMark network={o.network} size={14} /></span></td>
                      <td className="whitespace-nowrap text-right font-medium">{fmtInr(o.net)}</td>
                      <td className="whitespace-nowrap">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <StatusPill status={o.status} />
                          {maybePaid(o) && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300">Possible payment found</span>}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-500">{fmtISTShort(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
