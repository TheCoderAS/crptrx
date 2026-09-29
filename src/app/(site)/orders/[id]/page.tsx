import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft, CheckCircle2, Download, Hourglass, LifeBuoy, PauseCircle, XCircle } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { D, fmtInr, fmtUsdt } from "@/server/money";
import { userStatusText } from "@/server/orders/messages";
import { maskedPayout, payoutLast4, type PayoutSnapshot } from "@/server/payouts";
import { getSettings } from "@/server/settings";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { CopyButton } from "@/components/CopyButton";
import { AutoRefresh, Countdown } from "@/components/Countdown";
import { Banner, NetworkBadge, Row, Section, StatusPill, Steps, Timeline } from "@/components/ui";

export const metadata = { title: "Order" };

const PROGRESS = ["Send USDT", "Received", "Safety check", "Paid"];
const progressIndex: Record<string, number> = {
  QUOTE_READY: 0, PAYMENT_SUBMITTED: 0, PAYMENT_CONFIRMED: 1, UNDER_REVIEW: 2, ON_HOLD: 2, APPROVED: 3, PAID: 4,
};

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
    <Section title="Amounts" description="Fixed when the quote was created.">
      <div className="divide-y divide-slate-100">
        <Row k="USDT" v={`${amount} USDT`} />
        <Row k="Rate" v={`${fmtInr(o.rate)} per USDT`} />
        <Row k="Gross" v={fmtInr(o.gross)} />
        <Row k={`Tax held back (${D(o.taxPercent).toString()}%)`} v={`− ${fmtInr(o.taxHeld)}`} />
        <Row k={`Platform fee (${D(o.feePercent).toString()}%)`} v={`− ${fmtInr(o.fee)}`} />
        {D(o.gstOnFee).gt(0) && <Row k={`GST on fee (${D(o.gstPercent).toString()}%)`} v={`− ${fmtInr(o.gstOnFee)}`} />}
        <Row strong k="You receive" v={<span className="text-emerald-700">{fmtInr(o.net)}</span>} />
        <Row k="Paid to" v={maskedPayout(snap)} />
      </div>
    </Section>
  );

  // ---------------------------------------------------------------- quote
  if (showQuote)
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <div className="text-center">
          <p className="eyebrow">Your quote</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">You&apos;ll receive <span className="text-emerald-700">{fmtInr(o.net)}</span></h1>
        </div>
        <div className="card flex items-center gap-5">
          <Countdown until={o.quoteExpiresAt.toISOString()} variant="ring" />
          <div className="min-w-0">
            <p className="text-sm text-slate-500">Send exactly</p>
            <p className="money text-3xl text-slate-900">{amount} USDT</p>
            <div className="mt-1.5"><NetworkBadge network={n} /></div>
          </div>
        </div>
        <Banner tone="danger">Send only USDT on the <b>{nw}</b> network. Sending on any other network, or any other coin, may permanently lose your funds.</Banner>
        {breakdown}
        <Link href={`/orders/${o.id}`} className="btn-primary btn-lg w-full">Confirm and get deposit address</Link>
        <p className="text-center text-sm text-slate-500">Changed your mind? Do nothing. The quote expires on its own and nothing is charged.</p>
      </div>
    );

  // ---------------------------------------------------------------- order
  const qr = waiting ? await QRCode.toDataURL(o.depositAddress, { margin: 1, width: 240, color: { dark: "#0f172a" } }) : null;
  const pIdx = progressIndex[o.status];
  const HeroIcon = o.status === "PAID" ? CheckCircle2 : o.status === "ON_HOLD" ? PauseCircle : ["EXPIRED", "CLOSED_MANUAL"].includes(o.status) ? XCircle : Hourglass;
  const heroTone = o.status === "PAID" ? "bg-emerald-50 text-emerald-600" : o.status === "ON_HOLD" ? "bg-amber-50 text-amber-600" : ["EXPIRED", "CLOSED_MANUAL"].includes(o.status) ? "bg-slate-100 text-slate-500" : "bg-brand-50 text-brand-600";

  return (
    <div className="space-y-5">
      {(o.status === "QUOTE_READY" || o.status === "PAYMENT_SUBMITTED") && <AutoRefresh />}
      <div className="flex items-center justify-between gap-3">
        <Link href="/orders" className="btn-ghost -ml-3 px-3"><ArrowLeft className="size-4" aria-hidden /> Orders</Link>
        <span className="text-xs text-slate-500">{o.id}</span>
      </div>

      <section className="card">
        <div className="flex gap-4">
          <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${heroTone}`}><HeroIcon className="size-6" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><StatusPill status={o.status} /><NetworkBadge network={n} /></div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{text.title}</h1>
            <p className="mt-1 text-slate-600">{text.body}</p>
          </div>
        </div>
        {pIdx !== undefined && <div className="mt-6"><Steps steps={PROGRESS} current={pIdx} failed={o.status === "ON_HOLD"} /></div>}
        {o.status === "PAID" && (
          <div className="mt-6 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="text-sm">
              <p className="text-slate-500">Bank reference (UTR)</p>
              <p className="font-mono font-semibold text-slate-900">{o.utr}</p>
              <p className="mt-1 text-xs text-slate-500">Paid {fmtIST(o.paidAt)}</p>
            </div>
            <a href={`/api/orders/${o.id}/receipt`} className="btn-primary"><Download className="size-4" aria-hidden /> Download receipt (PDF)</a>
          </div>
        )}
      </section>

      {waiting && (
        <section className="card space-y-5 ring-2 ring-brand-600/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Send payment</p>
              <p className="mt-1 text-sm text-slate-600">Time left to send</p>
            </div>
            <Countdown until={o.quoteExpiresAt.toISOString()} variant="ring" />
          </div>
          <Banner tone="danger" title={`${nw} only`}>Send only USDT on the {nw} network. Sending on any other network, or any other coin, may permanently lose your funds.</Banner>
          {n === "BSC" && <Banner tone="warn">This is <b>not</b> an Ethereum (ERC-20) address, even though it looks similar.</Banner>}

          <div>
            <p className="label">Exact amount (including decimals)</p>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 ring-inset">
              <span className="money text-2xl text-slate-900 sm:text-3xl">{amount} USDT</span>
              <CopyButton text={D(o.usdtAmount).toFixed()} />
            </div>
            <p className="mt-1.5 text-sm font-medium text-rose-700">Send the exact amount shown, including decimals.</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="label">Deposit address ({nw})</p>
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 ring-inset">
                <span className="min-w-0 flex-1 font-mono text-sm break-all text-slate-900">{o.depositAddress}</span>
                <CopyButton text={o.depositAddress} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                The network fee is paid by you in {NETWORK_INFO[n].feeCoin}. Sending from an exchange? Make sure the amount that <b>arrives</b> is exactly {amount} USDT.
              </p>
            </div>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={`QR code for the ${nw} deposit address`} className="mx-auto size-40 rounded-xl bg-white p-2 ring-1 ring-slate-200" />
            )}
          </div>

          <ApiForm action={`/api/orders/${o.id}/txid`} className="space-y-2 border-t border-slate-100 pt-5">
            <label className="label" htmlFor="txid">Already sent? Paste the transaction ID <span className="font-normal text-slate-500">(optional, speeds things up)</span></label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input id="txid" name="txid" required className="input font-mono text-sm" placeholder={n === "BSC" ? "0x…" : "64-character transaction ID"} autoComplete="off" />
              <button className="btn-primary">I&apos;ve sent it</button>
            </div>
          </ApiForm>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          {breakdown}
          {o.txid && (
            <Section title="Blockchain payment">
              <div className="divide-y divide-slate-100">
                <Row k="Transaction ID" v={<span className="font-mono text-xs">{o.txid}</span>} />
                {o.receivedAmount && <Row k="Amount received" v={`${fmtUsdt(o.receivedAmount)} USDT`} />}
              </div>
            </Section>
          )}
        </div>
        <div className="min-w-0 space-y-5">
          <Section title="Timeline" description="All times in IST.">
            <Timeline events={events} />
          </Section>
          <details className="card group" open={o.status === "ON_HOLD"}>
            <summary className="flex cursor-pointer list-none items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><LifeBuoy className="size-4" aria-hidden /></span>
              <span className="flex-1">
                <span className="block font-semibold text-slate-900">Contact support about this order</span>
                <span className="block text-xs text-slate-500">We reply by email. {s.business_hours_text}.</span>
              </span>
            </summary>
            <ApiForm action="/api/support" className="mt-4 space-y-3" resetOnSuccess>
              <input type="hidden" name="orderId" value={o.id} />
              <textarea name="message" required rows={4} className="input" placeholder="Tell us what happened" />
              <div>
                <label className="label" htmlFor="screenshot">Screenshot <span className="font-normal text-slate-500">(optional)</span></label>
                <input id="screenshot" name="screenshot" type="file" accept="image/jpeg,image/png,application/pdf" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" />
              </div>
              <button className="btn-secondary">Send message</button>
            </ApiForm>
          </details>
        </div>
      </div>
    </div>
  );
}
