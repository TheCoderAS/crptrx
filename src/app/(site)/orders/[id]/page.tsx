import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtInr, fmtUsdt, D } from "@/server/money";
import { userStatusText } from "@/server/orders/messages";
import { maskedPayout, payoutLast4, type PayoutSnapshot } from "@/server/payouts";
import { getSettings } from "@/server/settings";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { CopyButton } from "@/components/CopyButton";
import { AutoRefresh, Countdown } from "@/components/Countdown";
import { Banner, NetworkBadge, Row, StatusPill, Timeline } from "@/components/ui";

export const metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const user = await userOrLogin();
  const { id } = await params;
  const { step } = await searchParams;
  const o = await prisma.order.findFirst({ where: { id, userId: user.id } });
  if (!o) notFound();
  const [s, events] = await Promise.all([
    getSettings(),
    // Users never see private admin notes.
    prisma.orderEvent.findMany({ where: { orderId: o.id }, orderBy: { createdAt: "asc" }, select: { id: true, toStatus: true, createdAt: true, publicMessage: true } }),
  ]);
  const n = o.network as NetworkCode;
  const nw = NETWORK_INFO[n].name;
  const snap = o.payoutSnapshot as unknown as PayoutSnapshot;
  const text = userStatusText({ ...o, payoutLast4: payoutLast4(snap) }, { reviewHours: s.review_hours, businessHours: s.business_hours_text });
  const amount = fmtUsdt(o.usdtAmount);
  const waiting = o.status === "QUOTE_READY" && o.quoteExpiresAt > new Date();
  const showQuote = waiting && step === "quote";

  const breakdown = (
    <div className="card">
      <h2 className="h2 mb-2">Quote</h2>
      <Row k="USDT to send" v={`${amount} USDT`} />
      <Row k="Network" v={<NetworkBadge network={n} />} />
      <Row k="Rate" v={`${fmtInr(o.rate)} per USDT`} />
      <Row k="Gross" v={fmtInr(o.gross)} />
      <Row k={`Tax held back (${D(o.taxPercent).toString()}%)`} v={`− ${fmtInr(o.taxHeld)}`} />
      <Row k={`Platform fee (${D(o.feePercent).toString()}%)`} v={`− ${fmtInr(o.fee)}`} />
      {D(o.gstOnFee).gt(0) && <Row k={`GST on fee (${D(o.gstPercent).toString()}%)`} v={`− ${fmtInr(o.gstOnFee)}`} />}
      <div className="mt-2 border-t pt-2"><Row k={<b>You&apos;ll receive</b>} v={<span className="text-lg">{fmtInr(o.net)}</span>} /></div>
      <Row k="Paid to" v={maskedPayout(snap)} />
    </div>
  );

  if (showQuote)
    return (
      <div className="space-y-4">
        <h1 className="h1">Your quote</h1>
        <div className="card space-y-2 text-center">
          <p className="muted">Send exactly</p>
          <p className="text-3xl font-bold">{amount} USDT</p>
          <NetworkBadge network={n} large />
          <p className="muted">Locked for <Countdown until={o.quoteExpiresAt.toISOString()} /></p>
        </div>
        <Banner tone="danger">Send only USDT on the <b>{nw}</b> network. Sending on any other network, or any other coin, may permanently lose your funds.</Banner>
        {breakdown}
        <Link href={`/orders/${o.id}`} className="btn-primary w-full py-3 text-base">Confirm and get deposit address</Link>
        <p className="muted text-center">Changed your mind? Do nothing. The quote expires on its own and nothing is charged.</p>
      </div>
    );

  const qr = waiting ? await QRCode.toDataURL(o.depositAddress, { margin: 1, width: 220 }) : null;
  return (
    <div className="space-y-4">
      {(o.status === "QUOTE_READY" || o.status === "PAYMENT_SUBMITTED") && <AutoRefresh />}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-sm text-gray-500">Order {o.id}</h1>
        <NetworkBadge network={n} />
      </div>
      <div className="card space-y-1">
        <StatusPill status={o.status} />
        <p className="text-2xl font-bold">{text.title}</p>
        <p className="text-gray-700">{text.body}</p>
      </div>

      {waiting && (
        <div className="card space-y-4">
          <div className="text-center">
            <p className="muted">Network</p>
            <p className="text-2xl font-bold"><NetworkBadge network={n} large /></p>
          </div>
          <Banner tone="danger">Send only USDT on the <b>{nw}</b> network. Sending on any other network, or any other coin, may permanently lose your funds.</Banner>
          {n === "BSC" && <Banner tone="warn">This is <b>not</b> an Ethereum (ERC-20) address, even though it looks similar.</Banner>}
          <div>
            <p className="label">Exact amount (including decimals)</p>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 p-3">
              <span className="text-2xl font-bold">{amount} USDT</span>
              <CopyButton text={D(o.usdtAmount).toFixed()} />
            </div>
            <p className="mt-1 text-sm font-medium text-red-700">Send the exact amount shown, including decimals.</p>
          </div>
          <div>
            <p className="label">Deposit address ({nw})</p>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 p-3">
              <span className="font-mono text-sm break-all">{o.depositAddress}</span>
              <CopyButton text={o.depositAddress} />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} alt={`QR code for the ${nw} deposit address`} className="mx-auto mt-3 h-44 w-44" />}
          </div>
          <p className="text-center">Time left: <Countdown until={o.quoteExpiresAt.toISOString()} /></p>
          <p className="muted">The network fee is paid by you in {NETWORK_INFO[n].feeCoin}. If you send from an exchange, make sure the amount that <b>arrives</b> is exactly {amount} USDT.</p>
          <ApiForm action={`/api/orders/${o.id}/txid`} className="space-y-2 border-t pt-4">
            <label className="label" htmlFor="txid">Already sent? Paste the transaction ID (optional, speeds things up)</label>
            <input id="txid" name="txid" required className="input font-mono text-sm" placeholder={n === "BSC" ? "0x…" : "64 characters"} />
            <button className="btn-primary w-full">I&apos;ve sent it</button>
          </ApiForm>
        </div>
      )}

      {o.status === "PAID" && (
        <div className="card space-y-1">
          <Row k="Bank reference (UTR)" v={o.utr} />
          <Row k="Paid at" v={fmtIST(o.paidAt)} />
          <a href={`/api/orders/${o.id}/receipt`} className="btn-primary mt-3 w-full">Download receipt (PDF)</a>
        </div>
      )}

      {o.txid && (
        <div className="card">
          <Row k="Transaction ID" v={<span className="font-mono text-xs">{o.txid}</span>} />
          {o.receivedAmount && <Row k="Amount received" v={`${fmtUsdt(o.receivedAmount)} USDT`} />}
        </div>
      )}

      {breakdown}

      <div className="card">
        <h2 className="h2 mb-3">Timeline</h2>
        <Timeline events={events} />
        <p className="muted">Times are in IST. Quote created {fmtIST(o.createdAt)}.</p>
      </div>

      <details className="card" open={o.status === "ON_HOLD"}>
        <summary className="cursor-pointer font-semibold">Contact support about this order</summary>
        <ApiForm action="/api/support" className="mt-3 space-y-3" resetOnSuccess>
          <input type="hidden" name="orderId" value={o.id} />
          <textarea name="message" required rows={4} className="input" placeholder="Tell us what happened" />
          <div>
            <label className="label" htmlFor="screenshot">Screenshot (optional)</label>
            <input id="screenshot" name="screenshot" type="file" accept="image/jpeg,image/png,application/pdf" className="block w-full text-sm" />
          </div>
          <button className="btn-secondary">Send</button>
        </ApiForm>
      </details>
    </div>
  );
}
