import Link from "next/link";
import { Banknote, Coins, Gift, HandCoins, Wallet } from "lucide-react";
import type { EarningStatus, Prisma } from "@prisma/client";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { earningTotals } from "@/server/earnings";
import { D, Decimal, fmtInr } from "@/server/money";
import { isSuper } from "@/server/scope";
import { fmtISTShort, istMonthStart } from "@/lib/time";
import { ModalForm } from "@/components/Modal";
import { EmptyState, PageHeader, Stat, StatusPill } from "@/components/ui";

export const metadata = { title: "Earnings" };

const STATUSES: EarningStatus[] = ["PENDING", "SETTLED", "VOID"];

/**
 * Admins: what they've earned on their customers' paid orders and what's been paid to them.
 * Super admin: every admin's balance, "Mark paid" to settle it, cancelling an earning, and
 * this month's split of the money (fee, margin, admin shares, bonuses).
 */
export default async function Earnings({ searchParams }: { searchParams: Promise<{ admin?: string; status?: string }> }) {
  const me = await adminOrLogin();
  const sup = isSuper(me);
  const sp = await searchParams;
  const adminFilter = sup ? sp.admin || undefined : me.id;
  const status = STATUSES.includes(sp.status as EarningStatus) ? (sp.status as EarningStatus) : undefined;
  const where: Prisma.AdminEarningWhereInput = { ...(adminFilter ? { adminId: adminFilter } : {}), ...(status ? { status } : {}) };

  const [totals, rows, settlements, admins] = await Promise.all([
    earningTotals(sup ? {} : { adminId: me.id }),
    prisma.adminEarning.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { admin: { select: { name: true } } } }),
    prisma.adminSettlement.findMany({ where: adminFilter ? { adminId: adminFilter } : {}, orderBy: { createdAt: "desc" }, take: 50, include: { admin: { select: { name: true } } } }),
    sup ? prisma.admin.findMany({ where: { role: "ADMIN" }, orderBy: { name: "asc" }, select: { id: true, name: true, inviteCode: true, profitPercent: true, status: true, _count: { select: { customers: true } } } }) : Promise.resolve([]),
  ]);
  const mine = totals.get(me.id);
  const zero = new Decimal(0);

  // Super admin: how this month's paid orders split up (IST month).
  const month = sup
    ? (
        await prisma.$queryRaw<{ orders: number; fee: string | null; margin: string | null; admin_share: string | null; rewards: string | null; admin_rewards: string | null }[]>`
          SELECT count(*)::int AS orders,
                 sum(fee)::text AS fee,
                 sum(greatest(coalesce(margin, 0), 0))::text AS margin,
                 sum(coalesce("adminShare", 0))::text AS admin_share,
                 sum(reward)::text AS rewards,
                 sum(CASE WHEN "adminShare" IS NOT NULL THEN reward ELSE 0 END)::text AS admin_rewards
          FROM orders WHERE status = 'PAID' AND "paidAt" >= ${istMonthStart()}`
      )[0]
    : null;
  const m = month && {
    fee: D(month.fee ?? 0),
    margin: D(month.margin ?? 0),
    adminShare: D(month.admin_share ?? 0),
    rewards: D(month.rewards ?? 0),
    houseRewards: D(month.rewards ?? 0).minus(D(month.admin_rewards ?? 0)),
  };

  const href = (o: { admin?: string; status?: string }) => `/admin/earnings?${new URLSearchParams({ ...(o.admin ? { admin: o.admin } : {}), ...(o.status ? { status: o.status } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Earnings"
        subtitle={sup ? "Admins' share of the margin on their customers' paid orders." : "Your share of the margin on your customers' paid orders."}
        icon={<HandCoins className="size-6" />}
        tile="tile-emerald"
      />

      {!sup && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <Stat label="Owed to you" value={fmtInr(mine?.pending ?? zero)} icon={<Wallet className="size-5" />} tile="tile-amber" />
          <Stat label="Paid to you" value={fmtInr(mine?.settled ?? zero)} icon={<Banknote className="size-5" />} tile="tile-emerald" />
          <Stat label="Bonuses you gave" value={fmtInr(mine?.rewards ?? zero)} icon={<Gift className="size-5" />} tile="tile-violet" className="col-span-2 sm:col-span-1" />
        </div>
      )}

      {sup && m && (
        <div>
          <p className="eyebrow mb-3">This month (paid orders, IST)</p>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label="Platform fee (yours)" value={fmtInr(m.fee)} icon={<Coins className="size-5" />} tile="tile-blue" />
            <Stat label="Margin" value={fmtInr(m.margin)} icon={<Coins className="size-5" />} tile="tile-violet" />
            <Stat label="Admins' share" value={fmtInr(m.adminShare)} icon={<HandCoins className="size-5" />} tile="tile-amber" />
            <Stat label="Margin you keep" value={fmtInr(m.margin.minus(m.adminShare).minus(m.houseRewards))} icon={<Wallet className="size-5" />} tile="tile-emerald" />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Bonuses paid to customers: {fmtInr(m.rewards)} ({fmtInr(m.rewards.minus(m.houseRewards))} from admins&apos; shares, {fmtInr(m.houseRewards)} from yours). Orders without a market price have no margin. GST on the fee is owed to the government, so it isn&apos;t counted here.
          </p>
        </div>
      )}

      {sup && (
        <section className="card overflow-hidden p-0 sm:p-0">
          <h2 className="h2 px-4 pt-4">Admins</h2>
          {admins.length === 0 ? (
            <p className="muted px-4 pb-4">No admins yet. Add one under Admins.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Admin</th><th>Code</th><th className="text-right">Share</th><th className="text-right">Customers</th><th className="text-right">Owed</th><th className="text-right">Paid</th><th /></tr></thead>
                <tbody>
                  {admins.map((a) => {
                    const t = totals.get(a.id);
                    const owed = t?.pending ?? zero;
                    return (
                      <tr key={a.id}>
                        <td><Link href={href({ admin: a.id })} className="font-medium text-brand-700 hover:underline">{a.name}</Link>{a.status !== "ACTIVE" && <span className="ml-1.5 text-xs text-slate-500">(disabled)</span>}</td>
                        <td className="font-mono text-xs">{a.inviteCode ?? "—"}</td>
                        <td className="text-right">{a.profitPercent.toString()}%</td>
                        <td className="text-right"><Link href={`/admin/users?admin=${a.id}`} className="hover:underline">{a._count.customers}</Link></td>
                        <td className="text-right font-semibold tabular-nums">{fmtInr(owed)}{t?.pendingCount ? <span className="block text-xs font-normal text-slate-500">{t.pendingCount} orders</span> : null}</td>
                        <td className="text-right tabular-nums">{fmtInr(t?.settled ?? zero)}</td>
                        <td className="text-right">
                          {owed.gt(0) && (
                            <ModalForm
                              button="Mark paid…"
                              buttonClassName="btn-secondary min-h-8 px-3 py-1 text-xs"
                              title={`Pay ${a.name} ${fmtInr(owed)}`}
                              description="Send the money first, then record it here. Every pending earning is marked paid."
                              action="/api/admin/earnings/settle"
                              submitLabel={`Record ${fmtInr(owed)} paid`}
                            >
                              <input type="hidden" name="adminId" value={a.id} />
                              <input type="hidden" name="expectedAmount" value={owed.toFixed(2)} />
                              <div><label className="label" htmlFor={`ref-${a.id}`}>Bank reference / UTR <span className="font-normal text-slate-500">(optional)</span></label><input id={`ref-${a.id}`} name="reference" className="input font-mono" /></div>
                              <div><label className="label" htmlFor={`note-${a.id}`}>Note <span className="font-normal text-slate-500">(optional)</span></label><input id={`note-${a.id}`} name="note" className="input" /></div>
                            </ModalForm>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="card overflow-hidden p-0 sm:p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="h2">Orders{sup && adminFilter ? ` · ${admins.find((a) => a.id === adminFilter)?.name ?? ""}` : ""}</h2>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Filter">
            {[undefined, ...STATUSES].map((st) => (
              <Link key={st ?? "all"} href={href({ admin: sup ? adminFilter : undefined, status: st })} aria-current={status === st ? "page" : undefined} className={`rounded-lg px-2.5 py-1 ${status === st ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {st === undefined ? "All" : st === "PENDING" ? "Owed" : st === "SETTLED" ? "Paid" : "Cancelled"}
              </Link>
            ))}
            {sup && adminFilter && <Link href={href({ status })} className="rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-100">All admins</Link>}
          </nav>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<HandCoins className="size-6" />} title="Nothing yet">Earnings appear here when your customers&apos; orders are paid.</EmptyState>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Order</th>{sup && <th>Admin</th>}<th className="text-right">Margin</th><th className="text-right">Share</th><th className="text-right">Bonus</th><th className="text-right">Earned</th><th>Status</th><th>Date</th>{sup && <th />}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/admin/orders/${r.orderId}`} className="font-medium text-brand-700 hover:underline">{r.orderId}</Link></td>
                    {sup && <td className="text-sm">{r.admin.name}</td>}
                    <td className="text-right tabular-nums">{fmtInr(r.margin)}</td>
                    <td className="text-right tabular-nums">{fmtInr(r.share)} <span className="text-xs text-slate-500">({D(r.sharePercent).toString()}%)</span></td>
                    <td className="text-right tabular-nums">{D(r.reward).gt(0) ? `– ${fmtInr(r.reward)}` : "—"}</td>
                    <td className="text-right font-semibold tabular-nums">{fmtInr(r.amount)}</td>
                    <td><StatusPill status={r.status === "SETTLED" ? "PAID" : r.status === "VOID" ? "DISABLED" : "PENDING"} label={r.status === "PENDING" ? "Owed" : r.status === "SETTLED" ? "Paid" : "Cancelled"} />{r.voidReason && <span className="block max-w-48 truncate text-xs text-slate-500" title={r.voidReason}>{r.voidReason}</span>}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{fmtISTShort(r.createdAt)}</td>
                    {sup && (
                      <td className="text-right">
                        {r.status === "PENDING" && (
                          <ModalForm button="Cancel…" buttonClassName="btn-ghost min-h-8 px-2 py-1 text-xs text-rose-700" title={`Cancel the earning on ${r.orderId}?`} description="The admin won't be paid for this order. Use it for fraud or a mistake." action={`/api/admin/earnings/${r.id}/void`} submitLabel="Cancel earning">
                            <div><label className="label" htmlFor={`why-${r.id}`}>Why (logged, shown to the admin)</label><input id={`why-${r.id}`} name="reason" required minLength={5} className="input" /></div>
                          </ModalForm>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {settlements.length > 0 && (
        <section className="card overflow-hidden p-0 sm:p-0">
          <h2 className="h2 px-4 pt-4">Payouts {sup ? "to admins" : "to you"}</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Date</th>{sup && <th>Admin</th>}<th className="text-right">Amount</th><th className="text-right">Orders</th><th>Reference</th><th>Note</th></tr></thead>
              <tbody>
                {settlements.map((st) => (
                  <tr key={st.id}>
                    <td className="whitespace-nowrap text-xs text-slate-500">{fmtISTShort(st.createdAt)}</td>
                    {sup && <td className="text-sm">{st.admin.name}</td>}
                    <td className="text-right font-semibold tabular-nums">{fmtInr(st.amount)}</td>
                    <td className="text-right">{st.count}</td>
                    <td className="font-mono text-xs">{st.reference ?? "—"}</td>
                    <td className="max-w-64 truncate text-sm text-slate-600">{st.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
