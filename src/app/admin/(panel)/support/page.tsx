import { LifeBuoy } from "lucide-react";
import { FilterChips, PageHeader } from "@/components/ui";
import Link from "next/link";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";

export default async function Support({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  await adminOrLogin();
  const { all } = await searchParams;
  const msgs = await prisma.supportMessage.findMany({ where: all ? {} : { handled: false }, orderBy: { createdAt: "asc" }, include: { user: true }, take: 200 });
  return (
    <div className="space-y-4">
      <PageHeader title="Support" icon={<LifeBuoy className="size-6" />} tile="tile-rose" />
      <FilterChips items={[{ href: "/admin/support", label: "Open", active: !all }, { href: "/admin/support?all=1", label: "All", active: !!all }]} />
      {msgs.length === 0 && <p className="muted">No messages.</p>}
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
