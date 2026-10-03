import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { prisma } from "./db";
import { env } from "./env";
import { fmtInr, fmtUsdt } from "./money";
import { maskedPayout, type PayoutSnapshot } from "./payouts";
import { getSettings } from "./settings";
import { companyName, contactChannels } from "./contact";
import type { MatchEvent } from "./matching";
import { pushToAdmins, pushToUser, type PushNote } from "./firebase/push";

// ---------------------------------------------------------------------------
// Providers. "console" stores the message in outbound_messages and logs it,
// so the Docker test setup works without any email/SMS account.
// ---------------------------------------------------------------------------

export async function sendEmail(to: string, subject: string, body: string) {
  const provider = env.email.provider;
  let status = "SENT";
  let error: string | undefined;
  try {
    if (provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.email.resendApiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: env.email.from, to: [to], subject, text: body }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
    } else {
      console.log(`[email] to=${to} subject=${subject}\n${body}\n`);
    }
  } catch (e) {
    status = "FAILED";
    error = (e as Error).message;
    console.error(`[email] failed to=${to}: ${error}`);
  }
  // The console provider is the test Outbox, where testers need the links.
  // With a real provider, one-time links are not kept in the database.
  const stored = provider === "console" ? body : body.replace(/token=[^\s&]+/g, "token=[removed]");
  await prisma.outboundMessage.create({ data: { channel: "EMAIL", to, subject, body: stored, provider, status, error } });
}

export async function sendSms(to: string, body: string, otp?: string) {
  const provider = env.sms.provider;
  let status = "SENT";
  let error: string | undefined;
  try {
    if (provider === "msg91") {
      if (!otp) return; // R1 uses SMS for OTP only unless the owner enables alerts with a DLT template
      const res = await fetch(`https://control.msg91.com/api/v5/otp?template_id=${env.sms.msg91TemplateId}&mobile=${to.replace(/^\+/, "")}&otp=${otp}`, {
        method: "POST",
        headers: { authkey: env.sms.msg91AuthKey },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`MSG91 HTTP ${res.status}`);
    } else {
      console.log(`[sms] to=${to} ${body}`);
    }
  } catch (e) {
    status = "FAILED";
    error = (e as Error).message;
  }
  // Never store OTP codes in plain text.
  await prisma.outboundMessage.create({ data: { channel: "SMS", to, body: otp ? body.replace(otp, "******") : body, provider, status, error } });
}

// ---------------------------------------------------------------------------
// Templates (spec 4.9)
// ---------------------------------------------------------------------------

// Push goes alongside email: a short title and the order number, never amounts,
// names or bank details (it can show on a lock screen). Not awaited by callers'
// flows beyond this function, and it never throws.

async function toUser(userId: string, subject: string, body: string, push?: PushNote) {
  if (push) void pushToUser(userId, push);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const s = await getSettings();
  const contacts = contactChannels(s).map((c) => `${c.label}: ${c.value}`).join(" · ");
  const footer = `\n\n— ${companyName(s)}\n${s.business_hours_text}${contacts ? `\nNeed help? ${contacts}` : ""}`;
  await sendEmail(user.email, subject, body + footer);
  if (s.sms_notifications_enabled && user.mobile) await sendSms(user.mobile, `${subject}. ${body}`.slice(0, 300));
}

const orderLink = (id: string) => `${env.appUrl}/orders/${id}`;

export async function notifyOrder(orderId: string, kind: "PAYMENT_DETECTED" | "ON_HOLD" | "APPROVED" | "PAID" | "EXPIRED") {
  const o = await prisma.order.findUnique({ where: { id: orderId } });
  if (!o) return;
  const nw = NETWORK_INFO[o.network as NetworkCode].name;
  const snap = o.payoutSnapshot as unknown as PayoutSnapshot;
  const map = {
    PAYMENT_DETECTED: [`Payment received for ${o.id}`, `We received ${fmtUsdt(o.usdtAmount)} USDT on ${nw}. Your order is waiting for review.`],
    ON_HOLD: [`Order ${o.id} is on hold`, `Your order is on hold: ${o.holdReason ?? ""} ${o.holdMessage ?? ""}\nOur team will contact you, or you can contact support from the order page.`],
    APPROVED: [`Order ${o.id} approved`, `Approved. ${fmtInr(o.net)} is being sent to ${maskedPayout(snap)}.`],
    PAID: [`${fmtInr(o.net)} sent for ${o.id}`, `We sent ${fmtInr(o.net)} to ${maskedPayout(snap)}.${o.utr ? `\nBank reference (UTR): ${o.utr}` : ""}\nYou can download your receipt from the order page.`],
    EXPIRED: [`Quote ${o.id} expired`, `No payment was received in time. Nothing was charged. If you already sent USDT, contact support right away with your transaction ID.`],
  } as const;
  const [subject, body] = map[kind];
  const push = {
    PAYMENT_DETECTED: "Payment received",
    ON_HOLD: "Your order is on hold",
    APPROVED: "Order approved",
    PAID: "Payout sent",
    EXPIRED: "Quote expired",
  }[kind];
  await toUser(o.userId, subject, `${body}\n\n${orderLink(o.id)}`, { title: push, body: `Order ${o.id}`, link: `/orders/${o.id}`, tag: `order-${o.id}`, data: { type: "order_status", orderId: o.id, status: kind } });
}

export async function notifyKyc(userId: string, status: "APPROVED" | "NEEDS_CHANGES" | "DECLINED", reason?: string | null) {
  const m = {
    APPROVED: ["Your identity check is approved", "You can now add a bank account or UPI ID."],
    NEEDS_CHANGES: ["Your identity check needs changes", `Please fix this and upload again: ${reason ?? ""}`],
    DECLINED: ["Your identity check was declined", `Reason: ${reason ?? ""}`],
  }[status];
  await toUser(userId, m[0], `${m[1]}\n\n${env.appUrl}/kyc`, { title: m[0], body: status === "APPROVED" ? "Tap to continue" : "Tap to see what to fix", link: "/kyc", tag: "kyc", data: { type: "kyc", status } });
}

export async function notifyPayoutMethod(userId: string, approved: boolean, reason?: string | null) {
  await toUser(
    userId,
    approved ? "Your payout method is approved" : "Your payout method was declined",
    approved ? `You can now sell USDT.\n\n${env.appUrl}/sell` : `Reason: ${reason ?? ""}\n\n${env.appUrl}/payout-methods`,
    { title: approved ? "Payout method approved" : "Payout method declined", body: approved ? "You can now sell USDT" : "Tap to see why", link: approved ? "/sell" : "/payout-methods", tag: "payout-method", data: { type: "payout_method", approved: String(approved) } },
  );
}

export async function notifyMatchEvents(events: MatchEvent[]) {
  for (const e of events) {
    try {
      await notifyOrder(e.orderId, e.kind === "CONFIRMED" ? "PAYMENT_DETECTED" : "ON_HOLD");
      // Support: a paid-in order is waiting for review (or was held and needs a look).
      void pushToAdmins({
        title: e.kind === "CONFIRMED" ? "Payment received: review" : "Payment held: check",
        body: `Order ${e.orderId}`,
        link: `/admin/orders/${e.orderId}`,
        tag: `admin-order-${e.orderId}`,
        data: { type: "order_waiting", orderId: e.orderId },
      });
    } catch (err) {
      console.error("notify failed", err);
    }
  }
}

/** Admin alerts go by email and push. The push carries only the subject; `link` is the admin page to open. */
export async function notifySuperAdmins(subject: string, body: string, link = "/admin") {
  void pushToAdmins({ title: subject, body: "Tap to open the admin panel", link, tag: `alert-${subject}`, data: { type: "admin_alert" } }, { superOnly: true });
  const admins = await prisma.admin.findMany({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } });
  for (const a of admins) await sendEmail(a.email, subject, body);
}

export async function notifyAllAdmins(subject: string, body: string, link = "/admin") {
  void pushToAdmins({ title: subject, body: "Tap to open the admin panel", link, tag: `alert-${subject}`, data: { type: "admin_alert" } });
  const admins = await prisma.admin.findMany({ where: { status: "ACTIVE" } });
  for (const a of admins) await sendEmail(a.email, subject, body);
}
