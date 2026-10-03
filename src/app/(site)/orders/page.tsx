import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { Inbox, ListOrdered } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { ALLOWED_NEXT } from "@/server/orders/stateMachine";
import { pickSort } from "@/lib/sort";
import { EmptyState, PageHeader, Section, statusLabel } from "@/components/ui";
import { FilterMenu } from "@/components/FilterMenu";
import { ListToolbar } from "@/components/ListToolbar";
import { OrderList } from "@/components/OrderList";
import { unreadForUser } from "@/server/chat/service";

export const metadata = { title: "My orders", robots: { index: false, follow: false } };

const SORTS = [
  { value: "new", label: "Newest first" },
  { value: "old", label: "Oldest first" },
  { value: "high", label: "Amount: high to low" },
  { value: "low", label: "Amount: low to high" },
] as const;
type Sort = (typeof SORTS)[number]["value"];
const ORDER_BY: Record<Sort, Prisma.OrderOrderByWithRelationInput> = { new: { createdAt: "desc" }, old: { createdAt: "asc" }, high: { usdtAmount: "desc" }, low: { usdtAmount: "asc" } };

export default async function Orders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; sort?: string }> }) {
  const user = await userOrLogin();
  const sp = await searchParams;
  const statuses = Object.keys(ALLOWED_NEXT) as OrderStatus[];
  const filter = statuses.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : undefined;
  const sort = pickSort(sp.sort, SORTS.map((s) => s.value), "new");
  const q = sp.q?.trim();
  const search: Prisma.OrderWhereInput = q
    ? {
        OR: [
          { id: { contains: q, mode: "insensitive" } },
          { txid: q.toLowerCase() },
          { submittedTxid: q.toLowerCase() },
          { utr: q.toUpperCase() },
          ...(/^\d+(\.\d+)?$/.test(q) ? [{ usdtAmount: q }] : []),
        ],
      }
    : {};
  const [orders, unread] = await Promise.all([
    prisma.order.findMany({ where: { userId: user.id, ...(filter ? { status: filter } : {}), ...search }, orderBy: [ORDER_BY[sort], { createdAt: "desc" }], take: 200 }),
    unreadForUser(user.id),
  ]);
  // No tools until there's something to search.
  const hasAny = orders.length > 0 || (filter || q ? (await prisma.order.count({ where: { userId: user.id } })) > 0 : false);
  const statusHref = (s?: string) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(sort !== "new" ? { sort } : {}), ...(s ? { status: s } : {}) }).toString();
    return p ? `/orders?${p}` : "/orders";
  };
  return (
    <div className="space-y-4">
      <PageHeader tab title="My orders" icon={<ListOrdered className="size-6" />} action={<Link href="/sell" className="btn bg-brand-gradient text-white hover:opacity-95">New sale</Link>} />
      {hasAny && (
        <ListToolbar placeholder="Order ID, TxID, UTR or amount" sorts={[...SORTS]} defaultSort="new">
          <FilterMenu items={[{ href: statusHref(), label: "All orders", active: !filter }, ...statuses.map((s) => ({ href: statusHref(s), label: statusLabel(s), active: filter === s }))]} />
        </ListToolbar>
      )}
      <Section>
        {orders.length === 0 ? (
          <EmptyState icon={<Inbox className="size-6" />} title={filter || q ? "No matching orders" : "No orders yet"} action={!filter && !q ? <Link href="/sell" className="btn-primary">Sell USDT</Link> : undefined} />
        ) : (
          <OrderList orders={orders} unread={unread} />
        )}
      </Section>
    </div>
  );
}
