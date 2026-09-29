import Link from "next/link";
import { ArrowRight, BadgeCheck, Banknote, CheckCircle2, Clock3, Inbox, Landmark, Smartphone } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtInr } from "@/server/money";
import { getSettings, rateIsStale } from "@/server/settings";
import { EmptyState, Section } from "@/components/ui";
import { OrderList } from "@/components/OrderList";

export const metadata = { title: "Home", robots: { index: false, follow: false } };

export default async function Dashboard() {
  const user = await userOrLogin();
  const [pendingPm, approvedPm, orders, s, paidAgg, active] = await Promise.all([
    prisma.payoutMethod.count({ where: { userId: user.id, status: "PENDING", deletedAt: null } }),
    prisma.payoutMethod.count({ where: { userId: user.id, status: "APPROVED", deletedAt: null } }),
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    getSettings(),
    prisma.order.aggregate({ where: { userId: user.id, status: "PAID" }, _sum: { net: true }, _count: true }),
    prisma.order.count({ where: { userId: user.id, status: { in: ["QUOTE_READY", "PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED", "UNDER_REVIEW", "ON_HOLD", "APPROVED"] } } }),
  ]);
  const kycWaiting = user.kycStatus === "SUBMITTED";
  const steps = [
    { done: !!user.mobileVerifiedAt, waiting: false, icon: Smartphone, tile: "tile-blue", label: "Confirm your mobile number", detail: "We send a one-time code by SMS.", href: "/account", cta: "Confirm" },
    {
      done: user.kycStatus === "APPROVED",
      waiting: kycWaiting,
      icon: BadgeCheck,
      tile: "tile-violet",
      label: "Verify your identity",
      detail: kycWaiting ? "Submitted. We usually review within 24 hours." : user.kycStatus === "NEEDS_CHANGES" ? "We need a small change. Tap to see what." : "PAN, masked Aadhaar and a selfie.",
      href: "/kyc",
      cta: user.kycStatus === "NEEDS_CHANGES" ? "Fix now" : "Start",
    },
    {
      done: approvedPm > 0,
      waiting: approvedPm === 0 && pendingPm > 0,
      icon: Landmark,
      tile: "tile-emerald",
      label: "Add your bank account or UPI",
      detail: pendingPm > 0 && approvedPm === 0 ? "Added. We're checking the name matches your ID." : "In your own name. Payouts go only here.",
      href: "/payout-methods",
      cta: "Add",
    },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const ready = doneCount === steps.length;
  const firstName = user.displayName?.split(" ")[0];

  return (
    <div className="space-y-6">
      <section className="bg-mesh-dark relative overflow-hidden rounded-3xl p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-10 -bottom-16 size-56 rounded-full bg-emerald-400/20 blur-3xl" aria-hidden />
        <p className="text-sm text-white/70">{ready ? "You're all set" : `${doneCount} of ${steps.length} setup steps done`}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{firstName ? `Hello, ${firstName}` : "Welcome"}</h1>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-white/60 uppercase">{rateIsStale(s) ? "Rate updating" : "Today's rate"}</p>
            <p className="money mt-1 text-3xl">{rateIsStale(s) ? "—" : fmtInr(s.rate)} <span className="text-base font-medium text-white/60">/ USDT</span></p>
          </div>
          {ready && (
            <Link href="/sell" className="btn btn-lg bg-white text-brand-800 shadow-lg hover:bg-brand-50">
              Sell USDT <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </section>

      {!ready && (
        <Section title="Get set up" description={`${doneCount} of ${steps.length} done`}>
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-500 via-violet-500 to-emerald-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ol className="space-y-2">
            {steps.map(({ done, waiting, icon: Icon, tile, label, detail, href, cta }) => (
              <li key={label} className={`flex items-center gap-4 rounded-xl p-3 ${done ? "" : "bg-slate-50"}`}>
                <span className={`icon-tile size-10 rounded-xl ${done ? "tile-emerald" : waiting ? "tile-amber" : tile}`}>
                  {done ? <CheckCircle2 className="size-5" aria-hidden /> : waiting ? <Clock3 className="size-5" aria-hidden /> : <Icon className="size-5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${done ? "text-slate-500 line-through" : "text-slate-900"}`}>{label}</p>
                  {!done && <p className="text-xs text-slate-500">{detail}</p>}
                </div>
                {!done && !waiting && <Link href={href} className="btn-primary px-3.5 py-2">{cta}</Link>}
                {waiting && <Link href={href} className="btn-ghost px-3 py-2 text-xs">View</Link>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {ready && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Banknote, tile: "tile-emerald", label: "Received", value: fmtInr(paidAgg._sum.net ?? 0) },
            { icon: CheckCircle2, tile: "tile-blue", label: "Completed", value: String(paidAgg._count) },
            { icon: Clock3, tile: "tile-amber", label: "In progress", value: String(active) },
          ].map(({ icon: Icon, tile, label, value }) => (
            <div key={label} className="card p-4 sm:p-5">
              <span className={`icon-tile ${tile} size-9 rounded-xl`}><Icon className="size-4" aria-hidden /></span>
              <p className="mt-3 text-xs text-slate-500">{label}</p>
              <p className="money truncate text-lg text-slate-900 sm:text-xl">{value}</p>
            </div>
          ))}
        </div>
      )}

      <Section title="Recent orders" action={orders.length > 0 ? <Link href="/orders" className="text-sm font-medium text-brand-700 hover:text-brand-800">View all</Link> : undefined}>
        {orders.length === 0 ? (
          <EmptyState icon={<Inbox className="size-6" />} title="No orders yet">
            {ready ? "Your sales will appear here with their live status." : "Finish setting up to place your first order."}
          </EmptyState>
        ) : (
          <OrderList orders={orders} />
        )}
      </Section>
    </div>
  );
}
