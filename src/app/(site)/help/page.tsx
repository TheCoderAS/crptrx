import { getSettings } from "@/server/settings";
import { ChevronDown } from "lucide-react";
import { NetworkBadge, PageHeader } from "@/components/ui";

export const metadata = { title: "Help & FAQ" };

export default async function Help() {
  const s = await getSettings();
  const faqs: [string, React.ReactNode][] = [
    [
      "Which network should I use?",
      <>
        We accept USDT on two networks: <NetworkBadge network="TRON" /> and <NetworkBadge network="BSC" />. Pick the one your wallet or exchange supports and choose the <b>same</b> network when you withdraw. If you use Binance, BEP-20 is usually the easiest.
      </>,
    ],
    [
      "I sent USDT on Ethereum (ERC-20), Polygon or another network by mistake",
      <>
        BNB Smart Chain addresses start with <code>0x</code> and look exactly like Ethereum, Polygon and Arbitrum addresses, but they are different networks. Our system does not see payments on those networks. <b>Contact support immediately</b> with your transaction ID. Recovery may be possible in some cases, but it is manual, slow and not guaranteed.
      </>,
    ],
    ["Why is the amount something like 100.37 instead of 100?", "We add a few cents to every quote so we can tell your payment apart from others. Always send the exact amount shown, including decimals. If you send from an exchange, make sure the amount that arrives is exact (some exchanges deduct their fee from the amount)."],
    ["How long does it take?", `After your payment is confirmed on the blockchain (usually a few minutes), our team does a safety check. ${s.business_hours_text}. We usually finish within ${s.review_hours} business hours, then pay by bank transfer or UPI.`],
    ["What does “On hold” mean?", "It means we need to check something before paying, for example the amount didn't match, the payment was late, or the sending wallet needs extra checks. The order page shows the reason. Contact support from the order page if you have questions. Your money is not lost."],
    ["What are the fees and tax?", `1% of the gross amount is held back as tax (TDS) as required by Indian law, and reported against your PAN. A platform fee of ${s.fee_percent}%${s.gst_enabled ? ` plus ${s.gst_percent}% GST on the fee` : ""} applies. Your quote shows every amount before you send anything.`],
    ["What if my quote expires?", "If we don't receive the payment within 15 minutes, the quote expires and nothing is charged. If you already sent it, we'll still find it and our team will contact you to re-confirm the rate."],
    ["Can I be paid to someone else's account?", "No. Payouts go only to bank accounts or UPI IDs in your own name, matching your identity check."],
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Help & FAQ" subtitle="Straight answers about networks, timing, fees and tax." />
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)]">
        {faqs.map(([q, a]) => (
          <details key={q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-slate-900 hover:bg-slate-50">
              {q}
              <ChevronDown className="size-4 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="px-5 pb-5 text-sm leading-relaxed text-slate-600">{a}</div>
          </details>
        ))}
      </div>
      <div className="card mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">Still need help?</p>
          <p className="text-sm text-slate-500">Email {s.support_email}, or use &quot;Contact support&quot; on your order.</p>
        </div>
        <a href={`mailto:${s.support_email}`} className="btn-secondary">Email support</a>
      </div>
    </div>
  );
}
