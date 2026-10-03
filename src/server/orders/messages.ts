import type { OrderStatus } from "@prisma/client";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { fmtInr, fmtUsdt, type DecimalLike } from "../money";

/** Plain-language status text for users (spec section 6 and 12). */
export function userStatusText(o: {
  status: OrderStatus;
  network: NetworkCode | string;
  usdtAmount: DecimalLike;
  net: DecimalLike;
  quoteExpiresAt: Date;
  holdReason?: string | null;
  holdMessage?: string | null;
  utr?: string | null;
  paidAt?: Date | null;
  payoutLast4?: string | null;
}, ctx: { reviewHours: number; businessHours: string }): { title: string; body: string } {
  const net = fmtInr(o.net);
  const amt = fmtUsdt(o.usdtAmount);
  const nw = NETWORK_INFO[o.network as NetworkCode]?.name ?? o.network;
  switch (o.status) {
    case "QUOTE_READY":
      return { title: "Waiting for your payment", body: `Send exactly ${amt} USDT on ${nw} by ${fmtIST(o.quoteExpiresAt)}. You'll receive ${net}.` };
    case "EXPIRED":
      return { title: "Quote expired", body: "No payment received in time. Nothing was charged. Please start a new order." };
    case "PAYMENT_SUBMITTED":
      return { title: "Checking your payment", body: "We've got your transaction ID. Checking the blockchain. This usually takes a few minutes." };
    case "PAYMENT_CONFIRMED":
      return { title: "Payment received", body: `${amt} USDT received on ${nw}. Your order is waiting for review.` };
    case "UNDER_REVIEW":
      return {
        title: "Under review",
        body: `We're doing a standard safety check. Usually done within ${ctx.reviewHours} hours (${ctx.businessHours}).`,
      };
    case "ON_HOLD":
      return { title: "On hold", body: [o.holdReason ?? "We need to check something", o.holdMessage].filter(Boolean).map((t) => t!.trim().replace(/\.?$/, ".")).join(" ") };
    case "APPROVED":
      return { title: "Approved", body: `Approved. ${net} is being sent to your account ending ${o.payoutLast4 ?? "••••"}.` };
    case "PAID":
      return { title: "Paid", body: o.utr ? `${net} sent. Bank reference: ${o.utr}, at ${fmtIST(o.paidAt)}.` : `${net} sent at ${fmtIST(o.paidAt)}.` };
    case "CLOSED_MANUAL":
      return { title: "Closed", body: "Closed. Our team has contacted you about this order." };
  }
}
