import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { Inbox, ListOrdered } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { ALLOWED_NEXT } from "@/server/orders/stateMachine";
import { EmptyState, PageHeader, Section, statusLabel } from "@/components/ui";
import { FilterMenu } from "@/components/FilterMenu";
import { OrderList } from "@/components/OrderList";

export const metadata = { title: "My orders", robots: { index: false, follow: false } };

export default async function Orders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await userOrLogin();
  const { status } = await searchParams;
  const statuses = Object.keys(ALLOWED_NEXT) as OrderStatus[];
  const filter = statuses.includes(status as OrderStatus) ? (status as OrderStatus) : undefined;
  const orders = await prisma.order.findMany({ where: { userId: user.id, ...(filter ? { status: filter } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
  // No filter until there's something to filter.
  const hasAny = orders.length > 0 || (filter ? (await prisma.order.count({ where: { userId: user.id } })) > 0 : false);
  return (
    <div>
      <PageHeader
        title="My orders"
        icon={<ListOrdered className="size-6" />}
        action={
          <div className="flex items-center gap-2">
            {hasAny && <FilterMenu items={[{ href: "/orders", label: "All orders", active: !filter }, ...statuses.map((s) => ({ href: `/orders?status=${s}`, label: statusLabel(s), active: filter === s }))]} />}
            <Link href="/sell" className="btn bg-brand-gradient text-white hover:opacity-95">New sale</Link>
          </div>
        }
      />
      <Section>
        {orders.length === 0 ? (
          <EmptyState icon={<Inbox className="size-6" />} title={filter ? "No orders with this status" : "No orders yet"} action={!filter ? <Link href="/sell" className="btn-primary">Sell USDT</Link> : undefined} />
        ) : (
          <OrderList orders={orders} />
        )}
      </Section>
    </div>
  );
}
