import { LifeBuoy } from "lucide-react";
import { DocPreview } from "@/components/DocPreview";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/ui";
import { pickSort } from "@/lib/sort";
import { FilterMenu } from "@/components/FilterMenu";
import { ListToolbar } from "@/components/ListToolbar";

const SORTS = [
  { value: "new", label: "Newest first" },
  { value: "old", label: "Oldest first" },
] as const;
import Link from "next/link";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";

export default async function Support({ searchParams }: { searchParams: Promise<{ open?: string; q?: string; sort?: string }> }) {
  await adminOrLogin();
  const { open, q: rawQ, sort: sortParam } = await searchParams;
  const q = rawQ?.trim();
  const sort = pickSort(sortParam, SORTS.map((s) => s.value), "new");
  const search: Prisma.SupportMessageWhereInput = q
    ? { OR: [{ message: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }, { orderId: { contains: q, mode: "insensitive" } }] }
    : {};
  const msgs = await prisma.supportMessage.findMany({ where: { ...(open ? { handled: false } : {}), ...search }, orderBy: { createdAt: sort === "new" ? "desc" : "asc" }, include: { user: true }, take: 200 });
  const openHref = (on: boolean) => `/admin/support?${new URLSearchParams({ ...(on ? { open: "1" } : {}), ...(q ? { q } : {}), ...(sort !== "new" ? { sort } : {}) })}`;
  return (
    <div className="space-y-4">
      <PageHeader title="Support" icon={<LifeBuoy className="size-6" />} tile="tile-rose" />
      <ListToolbar placeholder="Email, order ID or message text" sorts={[...SORTS]} defaultSort="new">
        <FilterMenu items={[{ href: openHref(false), label: "All messages", active: !open }, { href: openHref(true), label: "Open only", active: !!open }]} />
      </ListToolbar>
      {msgs.length === 0 && <p className="muted">{q ? "Nothing matches your search." : "No messages."}</p>}
      {msgs.map((m) => (
        <div key={m.id} id={m.id} className="card space-y-2">
          <p className="text-sm"><b>{m.user.email}</b> · {fmtIST(m.createdAt)} {m.orderId && <>· <Link className="underline" href={`/admin/orders/${m.orderId}`}>{m.orderId}</Link></>}</p>
          <p className="whitespace-pre-wrap">{m.message}</p>
          {m.attachmentKey && <div className="max-w-xs"><DocPreview docs={[{ label: "Attachment", href: `/api/admin/support/${m.id}/file` }]} /></div>}
          {!m.handled ? <ApiForm action={`/api/admin/support/${m.id}`}><button className="btn-secondary">Mark handled</button></ApiForm> : <p className="muted">Handled</p>}
        </div>
      ))}
      <p className="muted">Reply to users by email from the support mailbox. In-app chat is not part of Release 1.</p>
    </div>
  );
}
