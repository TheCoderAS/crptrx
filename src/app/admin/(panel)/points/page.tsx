import Link from "next/link";
import { Ban, CalendarClock, Gift, Sparkles, Wallet } from "lucide-react";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { fmtISTShort } from "@/lib/time";
import { ModalForm } from "@/components/Modal";
import { EmptyState, PageHeader, Stat, StatusPill } from "@/components/ui";

export const metadata = { title: "Referral points" };

const FILTERS = ["pending", "ready", "blocked"] as const;

/** Super admin: points users earn by inviting users. 1 point = ₹1, paid by the house when used. */
export default async function Points({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await adminOrLogin("SUPER_ADMIN");
  const sp = await searchParams;
  const f = FILTERS.find((x) => x === sp.f);
  const now = new Date();
  const where =
    f === "pending" ? { status: "ACTIVE" as const, availableAt: { gt: now } }
    : f === "ready" ? { status: "ACTIVE" as const, availableAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
    : f === "blocked" ? { status: { in: ["BLOCKED" as const, "CANCELLED" as const] } }
    : {};
  const [s, [t], [r], rows, top] = await Promise.all([
    getSettings(),
    prisma.$queryRaw<{ pending: number; ready: number; expired: number; blocked: number }[]>`
      SELECT
        coalesce(sum(points) FILTER (WHERE status = 'ACTIVE' AND "availableAt" > ${now}), 0)::int AS pending,
        coalesce(sum(points - used) FILTER (WHERE status = 'ACTIVE' AND "availableAt" <= ${now} AND ("expiresAt" IS NULL OR "expiresAt" > ${now})), 0)::int AS ready,
        coalesce(sum(points - used) FILTER (WHERE status = 'ACTIVE' AND "expiresAt" <= ${now}), 0)::int AS expired,
        count(*) FILTER (WHERE status <> 'ACTIVE')::int AS blocked
      FROM referral_points`,
    prisma.$queryRaw<{ held: number; spent: number }[]>`
      SELECT coalesce(sum(points) FILTER (WHERE status = 'HELD'), 0)::int AS held, coalesce(sum(points) FILTER (WHERE status = 'SPENT'), 0)::int AS spent FROM point_redemptions`,
    prisma.referralPoint.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { email: true } }, fromUser: { select: { email: true } } } }),
    prisma.$queryRaw<{ id: string; email: string; friends: number; earned: number; ready: number }[]>`
      SELECT u.id, u.email,
        (SELECT count(*) FROM users f WHERE f."referredById" = u.id)::int AS friends,
        coalesce(sum(p.points) FILTER (WHERE p.status = 'ACTIVE'), 0)::int AS earned,
        coalesce(sum(p.points - p.used) FILTER (WHERE p.status = 'ACTIVE' AND p."availableAt" <= ${now} AND (p."expiresAt" IS NULL OR p."expiresAt" > ${now})), 0)::int AS ready
      FROM referral_points p JOIN users u ON u.id = p."userId"
      GROUP BY u.id, u.email ORDER BY earned DESC LIMIT 10`,
  ]);

  const state = (p: (typeof rows)[number]) =>
    p.status === "BLOCKED" ? ["DISABLED", "Not given"]
    : p.status === "CANCELLED" ? ["DISABLED", "Cancelled"]
    : p.availableAt > now ? ["PENDING", "Pending"]
    : p.expiresAt && p.expiresAt <= now ? ["DISABLED", "Expired"]
    : p.used >= p.points ? ["PAID", "Used"]
    : ["APPROVED", "Ready"];
  const cancel = (p: (typeof rows)[number]) =>
    p.status === "ACTIVE" && p.availableAt > now && p.used === 0 ? (
      <ModalForm button="Cancel…" buttonClassName="btn-ghost min-h-8 px-2 py-1 text-xs text-rose-700" title={`Cancel ${p.points} points?`} description="For a fake or duplicate account. The user sees the reason." action={`/api/admin/points/${p.id}/cancel`} submitLabel="Cancel points">
        <div><label className="label" htmlFor={`why-${p.id}`}>Why</label><input id={`why-${p.id}`} name="reason" required minLength={5} maxLength={300} className="input" /></div>
      </ModalForm>
    ) : null;
  const tab = (key: (typeof FILTERS)[number] | undefined, label: string) => (
    <Link key={label} href={key ? `/admin/points?f=${key}` : "/admin/points"} aria-current={f === key ? "page" : undefined} className={`rounded-lg px-2.5 py-1 ${f === key ? "bg-brand-600 font-medium text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Referral points"
        subtitle={<>Users earn points when friends they invite sell. 1 point = ₹1 on their own sale, paid by you. {s.referral_enabled ? "On" : "Off"} · <Link href="/admin/settings" className="underline">Settings → Referral points</Link></>}
        icon={<Gift className="size-6" />}
        tile="tile-violet"
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Ready (you owe)" value={`₹${t.ready + r.held}`} icon={<Sparkles className="size-5" />} tile="tile-amber" />
        <Stat label="Pending" value={`₹${t.pending}`} icon={<CalendarClock className="size-5" />} tile="tile-blue" />
        <Stat label="Used on sales" value={`₹${r.spent}`} icon={<Wallet className="size-5" />} tile="tile-emerald" />
        <Stat label="Expired / not given" value={`₹${t.expired} · ${t.blocked}`} icon={<Ban className="size-5" />} tile="tile-slate" />
      </div>

      {top.length > 0 && (
        <section className="card overflow-hidden p-0 sm:p-0">
          <h2 className="h2 px-4 pt-4">Top referrers</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {top.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <Link href={`/admin/users/${u.id}`} className="min-w-0 truncate font-medium text-brand-700 hover:underline">{u.email}</Link>
                <span className="shrink-0 text-xs text-slate-500 tabular-nums">{u.friends} friends · {u.earned} earned · <b className="text-slate-800">{u.ready} ready</b></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-hidden p-0 sm:p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="h2">Points</h2>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Filter">{[tab(undefined, "All"), tab("pending", "Pending"), tab("ready", "Ready"), tab("blocked", "Not given / cancelled")]}</nav>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<Gift className="size-6" />} title="Nothing here">Points appear when an invited friend&apos;s sale is paid.</EmptyState>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {rows.map((p) => {
              const [pill, label] = state(p);
              return (
                <li key={p.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-all"><Link href={`/admin/users/${p.userId}`} className="font-medium text-brand-700 hover:underline">{p.user.email}</Link> <span className="text-slate-500">invited</span> <Link href={`/admin/users/${p.fromUserId}`} className="text-slate-700 hover:underline">{p.fromUser.email}</Link></span>
                    <span className="flex shrink-0 items-center gap-2"><StatusPill status={pill} label={label} /><b className="tabular-nums">+{p.points}</b></span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span><Link href={`/admin/orders/${p.orderId}`} className="hover:underline">{p.orderId}</Link> · {Number(p.usdt).toFixed(2)} USDT · {fmtISTShort(p.createdAt)}{p.status === "ACTIVE" && p.availableAt > now ? ` · ready ${fmtISTShort(p.availableAt)}` : ""}{p.used > 0 ? ` · ${p.used} used` : ""}{p.reason ? ` · ${p.reason}` : ""}</span>
                    {cancel(p)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
