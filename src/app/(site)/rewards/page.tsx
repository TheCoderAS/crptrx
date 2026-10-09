import Link from "next/link";
import { ArrowRight, ChevronDown, Gift } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { pointsBalance, rulesFor } from "@/server/points";
import { ensureReferralCode } from "@/server/referral";
import { getSettings } from "@/server/settings";
import { InviteCard } from "@/components/InviteCard";
import { EmptyState, PageHeader, StatusPill } from "@/components/ui";

export const metadata = { title: "Invite & earn", robots: { index: false, follow: false } };

/** "9 Oct": dates only, so lines stay short on phones. */
const day = (d: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(d);

/** "ra•••@gmail.com": enough to recognise a friend, not to read their address. */
const maskEmail = (e: string) => {
  const [name, domain] = e.split("@");
  return `${name.slice(0, 2)}•••@${domain ?? ""}`;
};

/** A user's referral code, link, points and history. Points are used on the Sell page. */
export default async function Rewards() {
  const user = await userOrLogin();
  const s = await getSettings();
  // Every user gets a code, verified or not: points are only earned when a friend's sale
  // is paid, and only spent on the user's own sale, which needs whatever checks are on.
  const on = s.referral_enabled && !user.referralDisabled;
  const code = on ? await ensureReferralCode(user.id) : user.referralCode;
  const now = new Date();
  const [b, rows, used, joined, sold] = await Promise.all([
    pointsBalance(user.id),
    prisma.referralPoint.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50, include: { fromUser: { select: { email: true, displayName: true } } } }),
    prisma.pointRedemption.findMany({ where: { userId: user.id, status: { in: ["HELD", "SPENT"] } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.user.count({ where: { referredById: user.id } }),
    prisma.user.count({ where: { referredById: user.id, orders: { some: { status: "PAID" } } } }),
  ]);
  const link = code ? `${env.appUrl.replace(/\/$/, "")}/signup?ref=${code}` : null;
  // The rules for this user (a super admin may have given them their own).
  const r = rulesFor(user, s);
  const per = r.referral_points_per_usdt;
  const cap = Number(r.referral_max_points_per_sale);
  const hold = Number(s.referral_hold_days);
  const expiry = Number(s.referral_expiry_days);
  const steps = [
    { title: "Share your link", body: "Friends sign up with your code. It's filled in for them." },
    { title: "They sell USDT", body: `You get ${per} ${per === "1" ? "point" : "points"} per USDT they sell${r.referral_mode === "FIRST" ? ", on their first sale" : ", on every sale"}.` },
    { title: "You sell", body: "Your points are added to your payout. 1 point = ₹1." },
  ];
  const rules = [
    ...(cap > 0 ? [`Up to ${cap} points from one sale.`] : []),
    ...(Number(r.referral_min_sale_usdt) > 0 ? [`Sales under ${r.referral_min_sale_usdt} USDT don't earn points.`] : []),
    hold > 0 ? `Points are ready ${hold} ${hold === 1 ? "day" : "days"} after your friend's sale is paid.` : "Points are ready as soon as your friend's sale is paid.",
    ...(expiry > 0 ? [`Use them within ${expiry} days of being ready.`] : []),
    "No points if your friend uses your own phone, PAN or bank account.",
  ];

  const state = (r: (typeof rows)[number]) => {
    if (r.status === "BLOCKED") return { pill: "DISABLED", label: "Not given", note: r.reason };
    if (r.status === "CANCELLED") return { pill: "DISABLED", label: "Cancelled", note: r.reason };
    if (r.availableAt > now) return { pill: "PENDING", label: "Pending", note: `Ready ${day(r.availableAt)}` };
    if (r.expiresAt && r.expiresAt <= now) return { pill: "DISABLED", label: "Expired", note: r.points - r.used > 0 ? `${r.points - r.used} expired` : null };
    if (r.used >= r.points) return { pill: "PAID", label: "Used", note: null };
    return { pill: "APPROVED", label: "Ready", note: r.expiresAt ? `Use by ${day(r.expiresAt)}` : null };
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Invite & earn" subtitle="Friends sell, you earn points." icon={<Gift className="size-6" />} tile="tile-violet" />

      {/* Points at a glance */}
      <section className="bg-brand-gradient rounded-3xl p-5 text-white shadow-lg shadow-brand-600/20">
        <p className="text-sm text-white/80">Your points</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-bold tabular-nums">{b.usable}</span>
          <span className="text-sm text-white/80">= ₹{b.usable} ready to use</span>
        </p>
        <p className="mt-3 text-sm text-white/80">
          {b.pending} pending{b.nextReadyAt ? ` (next ${day(b.nextReadyAt)})` : ""} · {b.spent + b.held} used
        </p>
        {b.usable > 0 && (
          <Link href="/sell" className="btn mt-4 w-full bg-white text-brand-700 hover:bg-white/90">
            Use on your next sale <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </section>

      {code && on && link ? (
        <InviteCard code={code} url={link} text={`Sell USDT for rupees on ${s.brand_name}. Sign up with my code ${code}:`} joined={joined} sold={sold} />
      ) : (
        <section className="card text-sm text-slate-600">
          {user.referralDisabled ? "Your invite code is switched off. Contact support if you think this is a mistake." : "Inviting friends isn't open right now."} Points you already have still work.
        </section>
      )}

      {on && (
        <section className="card">
          <h2 className="h2">How it works</h2>
          <ol className="mt-4 space-y-4">
            {steps.map((st, i) => (
              <li key={st.title} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 ring-1 ring-brand-200">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{st.title}</span>
                  <span className="block text-sm text-slate-500">{st.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <details className="group mt-4 border-t border-slate-100 pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-600">
              Rules <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-500">
              {rules.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </details>
        </section>
      )}

      <section className="card overflow-hidden p-0 sm:p-0">
        <h2 className="h2 px-4 pt-4">Points history</h2>
        {rows.length === 0 && used.length === 0 ? (
          <EmptyState icon={<Gift className="size-6" />} title="No points yet">Points appear here when a friend you invited sells.</EmptyState>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {used.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block text-slate-800">Used on <Link href={`/orders/${r.orderId}`} className="font-medium text-brand-700 hover:underline">{r.orderId}</Link></span>
                  <span className="text-xs text-slate-500">{day(r.createdAt)}{r.status === "HELD" ? " · order open" : ""}</span>
                </span>
                <span className="font-semibold tabular-nums text-slate-700">−{r.points}</span>
              </li>
            ))}
            {rows.map((r) => {
              const st = state(r);
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-slate-800">{r.fromUser.displayName ?? maskEmail(r.fromUser.email)} sold</span>
                    <span className="block text-xs text-slate-500">{day(r.createdAt)}{st.note ? ` · ${st.note}` : ""}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusPill status={st.pill} label={st.label} />
                    <span className={`font-semibold tabular-nums ${r.status === "ACTIVE" ? "text-emerald-700" : "text-slate-400 line-through"}`}>+{r.points}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
