import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { getSettings, rateIsStale } from "@/server/settings";
import { fmtInr } from "@/server/money";
import { NetworkBadge } from "@/components/ui";

export default async function Home() {
  if (await currentUser()) redirect("/dashboard");
  const s = await getSettings();
  const stale = rateIsStale(s);
  return (
    <div className="space-y-8">
      <section className="space-y-4 pt-4">
        <h1 className="text-3xl font-bold leading-tight">Sell USDT. Get rupees in your own bank account or UPI.</h1>
        <p className="text-gray-600">Verified Indian users only. You see the exact amount you&apos;ll receive before you send anything.</p>
        <div className="card flex items-center justify-between">
          <div>
            <p className="muted">Today&apos;s rate</p>
            <p className="text-2xl font-bold">{stale ? "Updating…" : `${fmtInr(s.rate)} per USDT`}</p>
          </div>
          <Link href="/login" className="btn-primary">Get started</Link>
        </div>
        <div className="flex flex-wrap gap-2"><NetworkBadge network="TRON" /><NetworkBadge network="BSC" /></div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["1. Verify", "Sign in, confirm your mobile, and upload your PAN and masked Aadhaar."],
          ["2. Add your bank or UPI", "Payouts go only to accounts in your own name."],
          ["3. Sell", "Get a 15-minute locked quote, send USDT, and track every step."],
        ].map(([t, d]) => (
          <div key={t} className="card">
            <h2 className="font-semibold">{t}</h2>
            <p className="muted mt-1">{d}</p>
          </div>
        ))}
      </section>
      <p className="muted">{s.business_hours_text}. 1% tax is held back on each sale as required by law. See <Link className="underline" href="/help">fees and tax</Link>.</p>
    </div>
  );
}
