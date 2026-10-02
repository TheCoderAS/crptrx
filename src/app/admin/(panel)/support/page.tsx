import { LifeBuoy } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/ui";
import { pickSort } from "@/lib/sort";
import { FilterMenu } from "@/components/FilterMenu";
import { ListToolbar } from "@/components/ListToolbar";

const SORTS = [
  { value: "old", label: "Oldest first" },
  { value: "new", label: "Newest first" },
] as const;
import Link from "next/link";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";

export default async function Support({ searchParams }: { searchParams: Promise<{ all?: string; q?: string; sort?: string }> }) {
  await adminOrLogin();
  const { all, q: rawQ, sort: sortParam } = await searchParams;
  const q = rawQ?.trim();
  const sort = pickSort(sortParam, SORTS.map((s) => s.value), "old");
  const search: Prisma.SupportMessageWhereInput = q
    ? { OR: [{ message: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }, { orderId: { contains: q, mode: "insensitive" } }] }
    : {};
  const msgs = await prisma.supportMessage.findMany({ where: { ...(all ? {} : { handled: false }), ...search }, orderBy: { createdAt: sort === "new" ? "desc" : "asc" }, include: { user: true }, take: 200 });
  const allHref = (on: boolean) => `/admin/support?${new URLSearchParams({ ...(on ? { all: "1" } : {}), ...(q ? { q } : {}), ...(sort !== "old" ? { sort } : {}) })}`;
  return (
    <div className="space-y-4">
      <PageHeader title="Support" icon={<LifeBuoy className="size-6" />} tile="tile-rose" />
      <ListToolbar placeholder="Email, order ID or message text" sorts={[...SORTS]} defaultSort="old">
        <FilterMenu items={[{ href: allHref(false), label: "Open", active: !all }, { href: allHref(true), label: "All messages", active: !!all }]} />
      </ListToolbar>
      {msgs.length === 0 && <p className="muted">{q ? "Nothing matches your search." : "No messages."}</p>}
      {msgs.map((m) => (
        <div key={m.id} id={m.id} className="card space-y-2">
          <p className="text-sm"><b>{m.user.email}</b> · {fmtIST(m.createdAt)} {m.orderId && <>· <Link className="underline" href={`/admin/orders/${m.orderId}`}>{m.orderId}</Link></>}</p>
          <p className="whitespace-pre-wrap">{m.message}</p>
          {m.attachmentKey && <a className="text-sm underline" target="_blank" rel="noreferrer" href={`/api/admin/support/${m.id}/file`}>Open attachment</a>}
          {!m.handled ? <ApiForm action={`/api/admin/support/${m.id}`}><button className="btn-secondary">Mark handled</button></ApiForm> : <p className="muted">Handled</p>}
        </div>
      ))}
      <p className="muted">Reply to users by email from the support mailbox. In-app chat is not part of Release 1.</p>
    </div>
  );
}
