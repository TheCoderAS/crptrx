import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Banknote, Clock, FileText, Landmark, Lock, ShieldCheck, Wallet } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { getSettings, isRealValue, rateIsStale } from "@/server/settings";
import { NetworkBadge } from "@/components/ui";
import { RateCalculator } from "@/components/RateCalculator";

export default async function Home() {
  if (await currentUser()) redirect("/dashboard");
  const s = await getSettings();
  const stale = rateIsStale(s);
  const steps = [
    { icon: BadgeCheck, title: "Verify once", body: "Sign in with Google, confirm your mobile and upload your PAN and masked Aadhaar." },
    { icon: Landmark, title: "Add your bank or UPI", body: "In your own name only. We check it against your ID before the first payout." },
    { icon: Wallet, title: "Send USDT", body: "Get an exact quote locked for 15 minutes, then send from any wallet or exchange." },
    { icon: Banknote, title: "Get paid in rupees", body: "After a safety check we pay to your account and send you a receipt with the bank reference." },
  ];
  const trust = [
    ...(isRealValue(s.company_fiu_reg) ? [{ icon: ShieldCheck, title: "Registered with FIU-IND", body: `Registration no. ${s.company_fiu_reg}` }] : []),
    { icon: ShieldCheck, title: "Verified users only", body: "Everyone passes an ID check, and payouts go only to accounts in the user's own name." },
    { icon: FileText, title: "Tax handled for you", body: `${s.tax_percent}% TDS is held back and reported against your PAN, as the law requires.` },
    { icon: Lock, title: "Your data is protected", body: "ID documents are stored privately, opened only through short-lived links, and every view is logged." },
    { icon: Clock, title: "Clear timelines", body: s.business_hours_text },
  ];
  return (
    <div className="space-y-20 sm:space-y-24">
      <section className="grid items-center gap-10 pt-2 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
            <span className="size-1.5 rounded-full bg-emerald-500" /> For verified Indian users
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance text-slate-900 sm:text-5xl">
            Sell USDT. Get rupees in <span className="text-brand-700">your own bank account.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            See the exact amount you&apos;ll receive before you send anything. Every step is tracked, and every payout comes with a bank reference and a receipt.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">Supported:</span>
            <NetworkBadge network="TRON" />
            <NetworkBadge network="BSC" />
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn-primary btn-lg">Create free account</Link>
            <Link href="/help" className="btn-secondary btn-lg">How it works</Link>
          </div>
        </div>
        <RateCalculator rate={s.rate} taxPercent={s.tax_percent} feePercent={s.fee_percent} gstEnabled={s.gst_enabled} gstPercent={s.gst_percent} stale={stale} live={s.rate_mode === "AUTO"} />
      </section>

      <section>
        <p className="eyebrow">How it works</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Four steps, no surprises</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="card">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon className="size-5" aria-hidden /></span>
                <span className="text-sm font-semibold text-slate-300">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-3xl bg-brand-950 px-6 py-10 text-white sm:px-10 sm:py-12">
        <p className="eyebrow text-brand-200">Why people trust us</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Built for compliance from day one</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {trust.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon className="size-6 text-emerald-400" aria-hidden />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-brand-100/80">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-slate-200 bg-white p-8 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Questions before you start?</h2>
          <p className="mt-1 text-slate-600">Which network to use, how long it takes, fees and tax, all explained simply.</p>
        </div>
        <Link href="/help" className="btn-secondary">Read the FAQ</Link>
      </section>
    </div>
  );
}
