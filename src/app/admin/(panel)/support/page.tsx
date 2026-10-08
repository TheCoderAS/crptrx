import Link from "next/link";
import { LifeBuoy, Paperclip } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { ownedScope } from "@/server/scope";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { DocPreview } from "@/components/DocPreview";
import { InboxLive } from "@/components/chat/InboxLive";
import { ListToolbar } from "@/components/ListToolbar";
import { PageHeader } from "@/components/ui";

// Order chats, grouped by who has to answer next. "Other" holds old messages
// sent without an order, from before chat existed.
const VIEWS = [
  { id: "us", label: "Waiting on us", where: { status: "OPEN", lastFrom: "USER" } },
  { id: "customer", label: "Waiting on customer", where: { status: "OPEN", lastFrom: "ADMIN" } },
  { id: "resolved", label: "Resolved", where: { status: "RESOLVED" } },
] as const;

export default async function Support({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const me = await adminOrLogin();
  const mine = ownedScope(me);
  const { view: rawView, q: rawQ } = await searchParams;
  const q = rawQ?.trim();
  const view = rawView === "other" ? "other" : VIEWS.find((v) => v.id === rawView)?.id ?? "us";
  const threadSearch: Prisma.SupportThreadWhereInput = { ...mine, ...(q ? { OR: [{ orderId: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }] } : {}) };
  const otherWhere: Prisma.SupportMessageWhereInput = { orderId: null, ...mine, ...(q ? { OR: [{ message: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }] } : {}) };

  const [counts, otherCount] = await Promise.all([
    Promise.all(VIEWS.map((v) => prisma.supportThread.count({ where: { ...v.where, ...threadSearch } }))),
    prisma.supportMessage.count({ where: { ...otherWhere, handled: false } }),
  ]);
  const current = VIEWS.find((v) => v.id === view);
  const threads = current
    ? await prisma.supportThread.findMany({
        where: { ...current.where, ...threadSearch },
        // Longest-waiting first when it's our turn; newest first otherwise.
        orderBy: { lastMessageAt: view === "us" ? "asc" : "desc" },
        include: { user: { select: { email: true } }, order: { select: { support: { orderBy: { createdAt: "desc" }, take: 1 } } } },
        take: 200,
      })
    : [];
  const others = view === "other" ? await prisma.supportMessage.findMany({ where: otherWhere, orderBy: { createdAt: "desc" }, include: { user: true }, take: 200 }) : [];
  const href = (v: string) => `/admin/support?${new URLSearchParams({ ...(v !== "us" ? { view: v } : {}), ...(q ? { q } : {}) })}`;
  const tabs = [...VIEWS.map((v, i) => ({ id: v.id as string, label: v.label, n: counts[i], alert: v.id === "us" })), ...(otherCount > 0 || view === "other" ? [{ id: "other", label: "Other", n: otherCount, alert: true }] : [])];

  return (
    <div className="space-y-4">
      <InboxLive />
      <PageHeader title="Support" icon={<LifeBuoy className="size-6" />} tile="tile-rose" />
      <ListToolbar placeholder="Order ID or email" />
      <nav className="-mx-4 tab-row flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0" aria-label="Chats">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={href(t.id)}
            aria-current={view === t.id ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap ${view === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t.label}
            {t.n > 0 && <span className={`rounded-full px-1.5 text-xs font-semibold ${t.alert ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{t.n}</span>}
          </Link>
        ))}
      </nav>

      {current && threads.length === 0 && <p className="muted">{q ? "Nothing matches your search." : view === "us" ? "All caught up." : "No chats here."}</p>}
      {threads.length > 0 && (
        <ul className="card divide-y divide-slate-100 p-0">
          {threads.map((t) => {
            const last = t.order.support[0];
            const unseen = t.lastFrom === "USER" && (!t.adminReadAt || t.adminReadAt < t.lastMessageAt);
            return (
              <li key={t.orderId}>
                <Link href={`/admin/orders/${t.orderId}`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${unseen ? "bg-rose-500" : "bg-transparent"}`} aria-label={unseen ? "Unread" : undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{t.user.email}</span>
                      <span className="shrink-0 text-xs text-slate-500">{fmtIST(t.lastMessageAt)}</span>
                    </span>
                    <span className="block text-xs text-slate-500">{t.orderId}</span>
                    <span className={`mt-0.5 flex items-center gap-1 truncate text-sm ${unseen ? "text-slate-900" : "text-slate-600"}`}>
                      {last?.authorType === "ADMIN" && <span className="text-slate-400">You:</span>}
                      {last?.attachmentKey && <Paperclip className="size-3.5 shrink-0" aria-label="Attachment" />}
                      <span className="truncate">{last?.message || (last?.attachmentKey ? "Screenshot" : "")}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {view === "other" && others.length === 0 && <p className="muted">No messages.</p>}
      {others.map((m) => (
        <div key={m.id} id={m.id} className="card space-y-2">
          <p className="text-sm"><b>{m.user.email}</b> · {fmtIST(m.createdAt)}</p>
          <p className="whitespace-pre-wrap">{m.message}</p>
          {m.attachmentKey && <div className="max-w-xs"><DocPreview docs={[{ label: "Attachment", href: `/api/admin/support/${m.id}/file` }]} /></div>}
          {!m.handled ? <ApiForm action={`/api/admin/support/${m.id}`}><button className="btn-secondary">Mark handled</button></ApiForm> : <p className="muted">Handled</p>}
        </div>
      ))}
    </div>
  );
}
