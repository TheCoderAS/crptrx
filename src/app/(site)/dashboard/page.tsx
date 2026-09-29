import Link from "next/link";
import { ArrowRight, BadgeCheck, CheckCircle2, Clock3, Inbox, Landmark, Smartphone } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtInr } from "@/server/money";
import { getSettings, rateIsStale } from "@/server/settings";
import { EmptyState, PageHeader, Section } from "@/components/ui";
import { OrderList } from "@/components/OrderList";

export const metadata = { title: "Home" };

export default async function Dashboard() {
  const user = await userOrLogin();
  const [pendingPm, approvedPm, orders, s] = await Promise.all([
    prisma.payoutMethod.count({ where: { userId: user.id, status: "PENDING", deletedAt: null } }),
    prisma.payoutMethod.count({ where: { userId: user.id, status: "APPROVED", deletedAt: null } }),
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    getSettings(),
  ]);
  const kycWaiting = user.kycStatus === "SUBMITTED";
  const steps = [
    { done: !!user.mobileVerifiedAt, waiting: false, icon: Smartphone, label: "Confirm your mobile number", detail: "We send a one-time code by SMS.", href: "/account", cta: "Confirm" },
    {
      done: user.kycStatus === "APPROVED",
      waiting: kycWaiting,
      icon: BadgeCheck,
      label: "Verify your identity",
      detail: kycWaiting ? "Submitted. We usually review within 24 hours." : user.kycStatus === "NEEDS_CHANGES" ? "We need a small change. Tap to see what." : "PAN, masked Aadhaar and a selfie.",
      href: "/kyc",
      cta: user.kycStatus === "NEEDS_CHANGES" ? "Fix now" : "Start",
    },
    {
      done: approvedPm > 0,
      waiting: approvedPm === 0 && pendingPm > 0,
      icon: Landmark,
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
      <PageHeader title={firstName ? `Hello, ${firstName}` : "Welcome"} subtitle={ready ? "You're all set to sell USDT." : "A few quick steps before your first sale."} />

      {!ready && (
        <Section title="Get set up" description={`${doneCount} of ${steps.length} done`}>
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ol className="space-y-2">
            {steps.map(({ done, waiting, icon: Icon, label, detail, href, cta }) => (
              <li key={label} className={`flex items-center gap-4 rounded-xl p-3 ${done ? "" : "bg-slate-50"}`}>
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${done ? "bg-emerald-50 text-emerald-600" : waiting ? "bg-amber-50 text-amber-600" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>
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
        <Link href="/sell" className="group block overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 p-6 text-white shadow-[var(--shadow-raised)] sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-brand-100">{rateIsStale(s) ? "Rate is updating" : "Today's rate"}</p>
              <p className="money mt-1 text-3xl">{rateIsStale(s) ? "—" : fmtInr(s.rate)} <span className="text-base font-medium text-brand-100">/ USDT</span></p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-brand-800 transition group-hover:gap-3">
              Sell USDT <ArrowRight className="size-4" aria-hidden />
            </span>
          </div>
        </Link>
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
