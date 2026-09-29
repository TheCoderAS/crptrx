import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight, BadgeCheck, Banknote, Clock3, FileCheck2, Fingerprint, Landmark, LineChart, Lock, ReceiptText, ScanFace, ShieldCheck, Timer, Wallet,
} from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { getSettings, isRealValue, rateIsStale } from "@/server/settings";
import { NetworkMark } from "@/components/ui";
import { RateCalculator } from "@/components/RateCalculator";
import { FloatingChips } from "@/components/HeroPreview";
import { JsonLd } from "@/components/JsonLd";
import { siteUrl } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: { absolute: `Sell USDT for INR to your bank or UPI | ${s.brand_name}` },
    description: `Sell USDT (TRC-20 or BEP-20) and get rupees in your own bank account or UPI. Exact quote locked for 15 minutes, TDS handled, PDF receipt with bank reference.`,
    alternates: { canonical: "/" },
  };
}

export default async function Home() {
  if (await currentUser()) redirect("/dashboard");
  const s = await getSettings();
  const stale = rateIsStale(s);
  const fiu = isRealValue(s.company_fiu_reg);

  const steps = [
    { icon: ScanFace, tile: "tile-blue", title: "Verify", body: "PAN + masked Aadhaar" },
    { icon: Landmark, tile: "tile-violet", title: "Add bank / UPI", body: "In your own name" },
    { icon: Wallet, tile: "tile-amber", title: "Send USDT", body: "Exact amount, 15-min lock" },
    { icon: Banknote, tile: "tile-emerald", title: "Get rupees", body: "Paid with a bank reference" },
  ];
  const features = [
    { icon: Timer, tile: "tile-blue", title: "Price locked 15 min", body: "The amount you see is the amount you get." },
    { icon: Lock, tile: "tile-violet", title: "Own-name payouts only", body: "Money never goes to a third party." },
    { icon: LineChart, tile: "tile-emerald", title: "Live order tracking", body: "Every step, time-stamped." },
    { icon: ReceiptText, tile: "tile-amber", title: "PDF receipt", body: "With UTR, TDS and fees itemised." },
    { icon: FileCheck2, tile: "tile-rose", title: `${s.tax_percent}% TDS handled`, body: "Reported against your PAN." },
    { icon: Fingerprint, tile: "tile-slate", title: "Human safety check", body: "Every order reviewed before payout." },
  ];

  return (
    <div className="space-y-20 sm:space-y-28">
      <JsonLd
        data={[
          { "@context": "https://schema.org", "@type": "WebSite", name: s.brand_name, url: siteUrl() },
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: isRealValue(s.company_name) ? s.company_name : s.brand_name,
            url: siteUrl(),
            logo: `${siteUrl()}/icon`,
            ...(isRealValue(s.support_email) ? { email: s.support_email } : {}),
          },
        ]}
      />

      {/* Hero */}
      <section className="bg-mesh relative -mx-4 overflow-hidden px-4 py-12 sm:mx-0 sm:rounded-[2rem] sm:px-10 sm:py-16 lg:px-14">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
        <div className="relative grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur">
              <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden /> KYC-verified · India only
            </span>
            <h1 className="mt-5 text-4xl leading-[1.05] font-bold tracking-tight text-slate-900 sm:text-6xl">
              USDT to <span className="text-gradient">rupees</span>,<br /> straight to your bank.
            </h1>
            <p className="mt-5 max-w-md text-lg text-slate-600">Exact quote. Own-name payout. Receipt with every rupee.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn btn-lg bg-brand-gradient text-white shadow-lg shadow-brand-600/25 hover:opacity-95">
                Start selling <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/help" className="btn-secondary btn-lg bg-white/80 backdrop-blur">How it works</Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-2">
              {[
                [Landmark, "Bank & UPI"],
                [Timer, "15-min price lock"],
                [FileCheck2, "TDS handled"],
              ].map(([Icon, label]) => {
                const I = Icon as typeof Landmark;
                return (
                  <li key={label as string} className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 backdrop-blur">
                    <I className="size-4 text-brand-600" aria-hidden /> {label as string}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <FloatingChips />
            <RateCalculator rate={s.rate} taxPercent={s.tax_percent} feePercent={s.fee_percent} gstEnabled={s.gst_enabled} gstPercent={s.gst_percent} stale={stale} live={s.rate_mode === "AUTO"} />
          </div>
        </div>
      </section>

      {/* Networks */}
      <section aria-labelledby="networks" className="grid gap-4 sm:grid-cols-2">
        <h2 id="networks" className="sr-only">Supported networks</h2>
        {[
          { n: "TRON", name: "Tron · TRC-20", body: "Low fees. Popular on Indian exchanges.", grad: "from-red-500/10 via-white to-white", ring: "ring-red-100" },
          { n: "BSC", name: "BNB Smart Chain · BEP-20", body: "Easiest for Binance users.", grad: "from-amber-400/15 via-white to-white", ring: "ring-amber-100" },
        ].map((x) => (
          <div key={x.n} className={`flex items-center gap-4 rounded-3xl bg-gradient-to-br ${x.grad} p-5 ring-1 ${x.ring}`}>
            <NetworkMark network={x.n} size={48} />
            <div>
              <h3 className="font-semibold text-slate-900">{x.name}</h3>
              <p className="text-sm text-slate-500">{x.body}</p>
            </div>
            <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">USDT</span>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section aria-labelledby="how">
        <div className="text-center">
          <p className="eyebrow">How it works</p>
          <h2 id="how" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Four steps. <span className="text-gradient">Zero guesswork.</span></h2>
        </div>
        <ol className="relative mt-12 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4">
          <span className="absolute top-7 right-[12%] left-[12%] hidden h-0.5 bg-gradient-to-r from-sky-300 via-violet-300 to-emerald-300 sm:block" aria-hidden />
          {steps.map(({ icon: Icon, tile, title, body }, i) => (
            <li key={title} className="relative flex flex-col items-center text-center">
              <span className={`icon-tile ${tile} size-14 rounded-2xl ring-4 ring-slate-50`}><Icon className="size-6" aria-hidden /></span>
              <span className="mt-3 text-xs font-bold text-slate-400">STEP {i + 1}</span>
              <h3 className="mt-1 font-semibold text-slate-900">{title}</h3>
              <p className="mt-0.5 text-sm text-slate-500">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section aria-labelledby="features">
        <h2 id="features" className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Built to be trusted</h2>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {features.map(({ icon: Icon, tile, title, body }) => (
            <div key={title} className="group rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] sm:p-6">
              <span className={`icon-tile ${tile}`}><Icon className="size-5" aria-hidden /></span>
              <h3 className="mt-4 text-[15px] font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust band */}
      <section className="bg-mesh-dark -mx-4 overflow-hidden px-6 py-12 text-white sm:mx-0 sm:rounded-[2rem] sm:px-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ...(fiu ? [{ icon: ShieldCheck, title: "FIU-IND registered", body: `Reg. no. ${s.company_fiu_reg}` }] : [{ icon: ShieldCheck, title: "Compliance first", body: "KYC for every user" }]),
            { icon: BadgeCheck, title: "Verified users only", body: "ID-checked accounts" },
            { icon: Lock, title: "Private documents", body: "Every view logged" },
            { icon: Clock3, title: "Clear timelines", body: s.business_hours_text },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Icon className="size-5 text-emerald-300" aria-hidden /></span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-white/70">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-gradient relative overflow-hidden rounded-[2rem] px-6 py-12 text-center text-white sm:px-12">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready when you are.</h2>
        <p className="mt-2 text-white/80">Set up once. Sell in minutes.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn btn-lg bg-white text-brand-800 shadow-lg hover:bg-brand-50">Create free account <ArrowRight className="size-4" aria-hidden /></Link>
          <Link href="/help" className="btn btn-lg text-white ring-1 ring-white/40 hover:bg-white/10">Read the FAQ</Link>
        </div>
      </section>
    </div>
  );
}
