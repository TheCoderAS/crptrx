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
      <div className="flex items-center justify-between"><h1 className="h1">Support messages</h1><Link className="text-sm underline" href={all ? "/admin/support" : "/admin/support?all=1"}>{all ? "Open only" : "Show all"}</Link></div>
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
