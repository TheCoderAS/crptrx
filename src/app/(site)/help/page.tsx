import { getSettings } from "@/server/settings";
import { NetworkBadge } from "@/components/ui";

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
    <div className="space-y-4">
      <h1 className="h1">Help &amp; FAQ</h1>
      {faqs.map(([q, a]) => (
        <details key={q} className="card">
          <summary className="cursor-pointer font-semibold">{q}</summary>
          <div className="mt-2 text-sm text-gray-700">{a}</div>
        </details>
      ))}
      <p className="muted">Still stuck? Email {s.support_email}, or use &quot;Contact support&quot; on your order.</p>
    </div>
  );
}
