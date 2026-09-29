import Link from "next/link";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { maskedPayout } from "@/server/payouts";
import { getSettings, rateIsStale } from "@/server/settings";
import { Banner, PageHeader } from "@/components/ui";
import { SellForm } from "@/components/SellForm";
import { NETWORK_CODES } from "@/lib/networks";

export const metadata = { title: "Sell USDT" };

export default async function Sell() {
  const user = await userOrLogin();
  const [s, methods] = await Promise.all([
    getSettings(),
    prisma.payoutMethod.findMany({ where: { userId: user.id, status: "APPROVED", deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
  ]);
  if (user.kycStatus !== "APPROVED" || methods.length === 0 || !user.mobileVerifiedAt)
    return (
      <div>
        <PageHeader title="Sell USDT" />
        <Banner tone="warn" title="Almost there">You need an approved identity check and an approved bank account or UPI ID before selling. <Link className="font-medium underline" href="/dashboard">See what&apos;s left</Link>.</Banner>
      </div>
    );
  const stale = rateIsStale(s);
  const available = Object.fromEntries(NETWORK_CODES.map((n) => [n, s.network_enabled[n] && !!s.deposit_address[s.network_mode][n]])) as Record<"TRON" | "BSC", boolean>;
  return (
    <div>
      <PageHeader title="Sell USDT" subtitle="Three quick choices. You'll see the exact amount before sending anything." />
      {stale ? (
        <Banner tone="warn">Our rate is being updated. Please try again shortly.</Banner>
      ) : (
        <SellForm
          rate={s.rate}
          taxPercent={s.tax_percent}
          feePercent={s.fee_percent}
          gstEnabled={s.gst_enabled}
          gstPercent={s.gst_percent}
          min={s.limit_min_order_usdt}
          max={s.limit_max_order_usdt}
          available={available}
          methods={methods.map((m) => ({ id: m.id, label: maskedPayout(m), isDefault: m.isDefault }))}
        />
      )}
      <p className="muted mt-6">{s.business_hours_text}.</p>
    </div>
  );
}
