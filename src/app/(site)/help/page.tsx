import type { Metadata } from "next";
import { ChevronDown, Clock3, Mail, Network, PauseCircle, Percent, TimerReset, UserCheck, Wallet } from "lucide-react";
import { getSettings } from "@/server/settings";
import { JsonLd } from "@/components/JsonLd";
import { ContactLinks } from "@/components/ContactLinks";
import { contactChannels } from "@/server/contact";
import { NetworkBadge } from "@/components/ui";

export const metadata: Metadata = {
  title: "Help & FAQ: networks, timing, fees and tax",
  description: "Which USDT network to use (TRC-20 or BEP-20), how long payouts take, fees, TDS, what 'on hold' means, and what to do if you sent on the wrong network.",
  alternates: { canonical: "/help" },
};

export default async function Help() {
  const s = await getSettings();
  const channels = contactChannels(s);
  const faqs: { icon: typeof Network; tile: string; q: string; a: string; extra?: React.ReactNode }[] = [
    {
      icon: Network, tile: "tile-blue", q: "Which network should I use?",
      a: "Tron (TRC-20) or BNB Smart Chain (BEP-20). Pick the one your wallet or exchange supports, and choose the same network when you withdraw. On Binance, BEP-20 is usually easiest.",
      extra: <div className="mt-3 flex flex-wrap gap-2"><NetworkBadge network="TRON" /><NetworkBadge network="BSC" /></div>,
    },
    { icon: PauseCircle, tile: "tile-rose", q: "I sent USDT on Ethereum or another network by mistake", a: "BNB Smart Chain addresses look exactly like Ethereum, Polygon and Arbitrum addresses, but those networks are different and we can't see payments on them. Contact support right away with your transaction ID. Recovery is manual and not guaranteed." },
    { icon: Wallet, tile: "tile-violet", q: "How do you know the payment is mine?", a: "We match it by the exact amount and the wallet it came from. Paying with the wallet button on your order, or adding your wallet under Account, gets it matched fastest. From an exchange, make sure the amount that arrives is exact, since some exchanges deduct their fee." },
    { icon: Clock3, tile: "tile-emerald", q: "How long does it take?", a: `The blockchain confirms your payment in minutes. Our team then does a safety check (${s.business_hours_text}), usually within ${s.review_hours} business hours, and pays you by bank transfer or UPI.` },
    { icon: Percent, tile: "tile-amber", q: "What are the fees and tax?", a: `${s.tax_percent}% of the gross amount is held back as TDS, as the law requires, and reported against your PAN. The platform fee is ${s.fee_percent}%${s.gst_enabled ? ` plus ${s.gst_percent}% GST on the fee` : ""}. Your quote shows every amount before you send.` },
    { icon: TimerReset, tile: "tile-slate", q: "What if my quote expires?", a: "If we don't receive your payment within 15 minutes, the quote expires and nothing is charged. If you already sent it, we'll still find it and contact you to re-confirm the rate." },
    { icon: PauseCircle, tile: "tile-amber", q: "What does 'On hold' mean?", a: "We need to check something before paying, for example the amount didn't match or the payment was late. The order page shows the reason. Your money is not lost." },
    { icon: UserCheck, tile: "tile-blue", q: "Can I be paid to someone else's account?", a: "No. Payouts go only to bank accounts or UPI IDs in your own name, matching your identity check." },
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <div className="bg-mesh -mx-4 mb-8 px-4 py-10 text-center sm:mx-0 sm:rounded-[2rem]">
        <p className="eyebrow">Help centre</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Questions, <span className="text-gradient">answered.</span></h1>
        <p className="mt-2 text-slate-600">Networks, timing, fees and tax.</p>
      </div>
      <div className="space-y-3">
        {faqs.map(({ icon: Icon, tile, q, a, extra }) => (
          <details key={q} className="group rounded-2xl border border-slate-200/80 bg-white shadow-[var(--shadow-card)] transition open:shadow-[var(--shadow-raised)]">
            <summary className="flex cursor-pointer list-none items-center gap-4 p-4 sm:p-5">
              <span className={`icon-tile ${tile} size-10 rounded-xl`}><Icon className="size-5" aria-hidden /></span>
              <h2 className="flex-1 text-[15px] font-semibold text-slate-900">{q}</h2>
              <ChevronDown className="size-4 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="px-4 pb-5 pl-[4.5rem] text-sm leading-relaxed text-slate-600 sm:px-5 sm:pl-[4.75rem]">
              {a}
              {extra}
            </div>
          </details>
        ))}
      </div>
      <div className="bg-brand-gradient mt-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6 text-white">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-white/15"><Mail className="size-5" aria-hidden /></span>
          <div>
            <p className="font-semibold">Still need help?</p>
            <p className="text-sm text-white/80">{channels.length ? `We reply ${s.business_hours_text}.` : "Open your order and use “Contact support” at the bottom."}</p>
          </div>
        </div>
        <ContactLinks channels={channels} tone="dark" />
      </div>
    </div>
  );
}
