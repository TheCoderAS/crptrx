import Link from "next/link";
import { CalendarClock, Check, Gift, Link2, Sparkles, Users, Wallet } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { pointsBalance, rulesFor } from "@/server/points";
import { ensureReferralCode } from "@/server/referral";
import { getSettings } from "@/server/settings";
import { fmtISTShort } from "@/lib/time";
import { CopyButton } from "@/components/CopyButton";
import { ShareLink } from "@/components/ShareLink";
import { EmptyState, PageHeader, StatusPill } from "@/components/ui";

export const metadata = { title: "Invite & earn", robots: { index: false, follow: false } };

/** "ra•••@gmail.com": enough to recognise a friend, not to read their address. */
const maskEmail = (e: string) => {
  const [name, domain] = e.split("@");
  return `${name.slice(0, 2)}•••@${domain ?? ""}`;
};

/** A user's referral code, link, points and history. Points are used on the Sell page. */
export default async function Rewards() {
  const user = await userOrLogin();
  const s = await getSettings();
  const verified = user.kycStatus === "APPROVED";
  // The code is made once the person is verified, so codes only lead back to real people.
  const on = s.referral_enabled && !user.referralDisabled;
  const code = on && verified ? await ensureReferralCode(user.id) : user.referralCode;
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
  const benefits = [
    "Share your code or link with friends. It's filled in for them when they sign up.",
    `When a friend sells USDT, you get ${per} ${per === "1" ? "point" : "points"} for every USDT they sell${r.referral_mode === "FIRST" ? " (on their first sale)" : " (on every sale they make)"}.`,
    ...(cap > 0 ? [`Up to ${cap} points from one sale.`] : []),
    ...(Number(r.referral_min_sale_usdt) > 0 ? [`Sales under ${r.referral_min_sale_usdt} USDT don't earn points.`] : []),
    hold > 0 ? `Points are ready to use ${hold} ${hold === 1 ? "day" : "days"} after your friend's sale is paid.` : "Points are ready as soon as your friend's sale is paid.",
    "1 point = ₹1. Use them when you sell: they're added to your payout.",
    ...(expiry > 0 ? [`Use them within ${expiry} days of being ready.`] : []),
  ];

  const state = (r: (typeof rows)[number]) => {
    if (r.status === "BLOCKED") return { pill: "DISABLED", label: "Not given", note: r.reason };
    if (r.status === "CANCELLED") return { pill: "DISABLED", label: "Cancelled", note: r.reason };
    if (r.availableAt > now) return { pill: "PENDING", label: "Pending", note: `Ready ${fmtISTShort(r.availableAt)}` };
    if (r.expiresAt && r.expiresAt <= now) return { pill: "DISABLED", label: "Expired", note: r.points - r.used > 0 ? `${r.points - r.used} expired` : null };
    if (r.used >= r.points) return { pill: "PAID", label: "Used", note: null };
    return { pill: "APPROVED", label: "Ready", note: r.expiresAt ? `Use by ${fmtISTShort(r.expiresAt)}` : null };
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Invite & earn" subtitle="Earn points when friends you invite sell USDT. 1 point = ₹1 on your own sale." icon={<Gift className="size-6" />} tile="tile-violet" />

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 sm:p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Sparkles className="size-3.5" aria-hidden /> Ready</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{b.usable}</p>
          <p className="text-xs text-slate-500">= ₹{b.usable}</p>
        </div>
        <div className="card p-4 sm:p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><CalendarClock className="size-3.5" aria-hidden /> Pending</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{b.pending}</p>
          <p className="truncate text-xs text-slate-500">{b.nextReadyAt ? `Next ${fmtISTShort(b.nextReadyAt)}` : "—"}</p>
        </div>
        <div className="card p-4 sm:p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Wallet className="size-3.5" aria-hidden /> Used</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{b.spent + b.held}</p>
          <p className="truncate text-xs text-slate-500">{b.held ? `${b.held} on an open order` : "on your sales"}</p>
        </div>
      </div>

      {b.usable > 0 && (
        <Link href="/sell" className="btn-primary w-full sm:w-auto">Sell and add ₹{b.usable} to your payout</Link>
      )}

      {code && on ? (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Your invite code</p>
              <p className="font-mono text-2xl font-bold tracking-wider text-slate-900">{code}</p>
            </div>
            <CopyButton text={code} label="Copy code" />
          </div>
          {link && (
            <>
              <h2 className="h2 flex items-center gap-2 pt-1"><Link2 className="size-5 text-brand-600" aria-hidden /> Invite link</h2>
              <ShareLink url={link} text={`Sell USDT for rupees on ${s.brand_name}. Sign up with my code ${code}:`} />
            </>
          )}
          {on ? (
            <ul className="space-y-2 border-t border-slate-100 pt-3">
              {benefits.map((b) => (
                <li key={b} className="flex gap-2.5 text-sm text-slate-700">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-3.5" aria-hidden /></span>
                  {b}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">{user.referralDisabled ? "Your invite code is switched off. Contact support if you think this is a mistake." : "Inviting is paused right now."} Points you already have still work.</p>
          )}
          <p className="flex items-center gap-1.5 text-sm text-slate-600"><Users className="size-4 text-slate-400" aria-hidden /> {joined} joined · {sold} sold</p>
        </section>
      ) : (
        <section className="card text-sm text-slate-600">
          {user.referralDisabled ? "Your invite code is switched off. Contact support if you think this is a mistake. Points you already have still work." : !s.referral_enabled ? "Inviting friends isn't open right now." : <>Your invite code appears once your identity check is approved. <Link href="/kyc" className="font-semibold text-brand-700 hover:underline">Identity check</Link></>}
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
                  <span className="text-xs text-slate-500">{fmtISTShort(r.createdAt)}{r.status === "HELD" ? " · order open" : ""}</span>
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
                    <span className="block text-xs text-slate-500">{fmtISTShort(r.createdAt)}{st.note ? ` · ${st.note}` : ""}</span>
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
