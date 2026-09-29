import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { Inbox } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { ALLOWED_NEXT } from "@/server/orders/stateMachine";
import { EmptyState, PageHeader, Section, statusLabel } from "@/components/ui";
import { OrderList } from "@/components/OrderList";

export const metadata = { title: "My orders" };

export default async function Orders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await userOrLogin();
  const { status } = await searchParams;
  const statuses = Object.keys(ALLOWED_NEXT) as OrderStatus[];
  const filter = statuses.includes(status as OrderStatus) ? (status as OrderStatus) : undefined;
  const orders = await prisma.order.findMany({ where: { userId: user.id, ...(filter ? { status: filter } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <div>
      <PageHeader title="My orders" action={<Link href="/sell" className="btn-primary">New sale</Link>} />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href="/orders" className={`chip shrink-0 ${!filter ? "chip-active" : "bg-white"}`}>All</Link>
        {statuses.map((s) => (
          <Link key={s} href={`/orders?status=${s}`} className={`chip shrink-0 ${filter === s ? "chip-active" : "bg-white"}`}>{statusLabel(s)}</Link>
        ))}
      </div>
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
