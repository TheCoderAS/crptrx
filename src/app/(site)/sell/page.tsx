import { contactChannels } from "@/server/contact";
import { ContactLinks } from "@/components/ContactLinks";
import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { maskedPayout } from "@/server/payouts";
import { getSettings, rateIsStale } from "@/server/settings";
import { notReadyMessage, onboardingState } from "@/server/onboarding";
import { Banner, PageHeader } from "@/components/ui";
import { SellForm } from "@/components/SellForm";
import { NETWORK_CODES } from "@/lib/networks";

export const metadata = { title: "Sell USDT", robots: { index: false, follow: false } };

export default async function Sell() {
  const user = await userOrLogin();
  const [s, methods] = await Promise.all([
    getSettings(),
    prisma.payoutMethod.findMany({ where: { userId: user.id, status: "APPROVED", deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
  ]);
  const o = await onboardingState(user, s);
  if (!o.ready)
    return (
      <div>
        <PageHeader title="Sell USDT" tab />
        <Banner tone={o.blockedReason ? "danger" : "warn"} title={o.blockedReason ? undefined : "Almost there"}>
          {notReadyMessage(o)} {!o.blockedReason && <Link className="font-medium underline" href="/dashboard">See what&apos;s left</Link>}
        </Banner>
        {o.blockedReason && <div className="mt-3"><ContactLinks channels={contactChannels(s)} /></div>}
      </div>
    );
  const stale = rateIsStale(s);
  const available = Object.fromEntries(NETWORK_CODES.map((n) => [n, s.network_enabled[n] && !!s.deposit_address[s.network_mode][n]])) as Record<"TRON" | "BSC", boolean>;
  return (
    <div>
      <PageHeader tab title="Sell USDT" subtitle="Three choices. Exact amount before you send." icon={<ArrowLeftRight className="size-6" />} />
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
