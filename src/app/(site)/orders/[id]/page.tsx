import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { CheckCircle2, Download, Hourglass, PauseCircle, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { RECHECKABLE_HOLDS } from "@/server/matching";
import { prisma } from "@/server/db";
import { D, feeLabel, fmtInr, fmtUsdt } from "@/server/money";
import { userStatusText } from "@/server/orders/messages";
import { maskedPayout, payoutLast4, type PayoutSnapshot } from "@/server/payouts";
import { getSettings, tokenContractFor } from "@/server/settings";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { CopyButton } from "@/components/CopyButton";
import { PayWithWallet } from "@/components/PayWithWallet";
import { InfoTip } from "@/components/InfoTip";
import { env } from "@/server/env";
import { ChatLauncher } from "@/components/chat/ChatLauncher";
import { AutoRefresh, Countdown } from "@/components/Countdown";
import { BackLink, NetworkBadge, Row, Section, StatusPill, Steps, Timeline } from "@/components/ui";

export const metadata = { title: "Order", robots: { index: false, follow: false } };

const PROGRESS = ["Send", "Received", "Review", "Paid"];
const progressIndex: Record<string, number> = {
  QUOTE_READY: 0, PAYMENT_SUBMITTED: 0, PAYMENT_CONFIRMED: 1, UNDER_REVIEW: 2, ON_HOLD: 2, APPROVED: 3, PAID: 4,
};

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const user = await userOrLogin();
  const { id } = await params;
  const { step } = await searchParams;
  // In parallel; the events are only used once the order is confirmed to be theirs.
  const [o, s, events, thread] = await Promise.all([
    prisma.order.findFirst({ where: { id, userId: user.id } }),
    getSettings(),
    // Users never see private admin notes.
    prisma.orderEvent.findMany({ where: { orderId: id }, orderBy: { createdAt: "asc" }, select: { id: true, toStatus: true, createdAt: true, publicMessage: true } }),
    prisma.supportThread.findFirst({ where: { orderId: id, userId: user.id }, select: { lastFrom: true, lastMessageAt: true, userReadAt: true } }),
  ]);
  if (!o) notFound();
  const chat = (
    <ChatLauncher
      orderId={o.id}
      hours={s.business_hours_text}
      startUnread={!!thread && thread.lastFrom === "ADMIN" && (!thread.userReadAt || thread.userReadAt < thread.lastMessageAt)}
    />
  );
  const n = o.network as NetworkCode;
  const nw = NETWORK_INFO[n].name;
  const snap = o.payoutSnapshot as unknown as PayoutSnapshot;
  const text = userStatusText({ ...o, payoutLast4: payoutLast4(snap) }, { reviewHours: s.review_hours, businessHours: s.business_hours_text });
  const amount = fmtUsdt(o.usdtAmount);
  const waiting = o.status === "QUOTE_READY" && o.quoteExpiresAt > new Date();
  const showQuote = waiting && step === "quote";
  const breakdown = (
    <Section title="Amounts" info="Fixed when the quote was created. Rate changes after that don't affect this order.">
      <div className="divide-y divide-slate-100">
        <Row k="USDT" v={`${amount} USDT`} />
        <Row k="Rate" v={`${fmtInr(o.rate)} per USDT`} />
        <Row k="Gross" v={fmtInr(o.gross)} />
        {D(o.taxHeld).gt(0) && <Row k={`Tax held back (${D(o.taxPercent).toString()}%)`} v={`− ${fmtInr(o.taxHeld)}`} />}
        {D(o.fee).gt(0) && <Row k={feeLabel("Platform fee", o)} v={`− ${fmtInr(o.fee)}`} />}
        {D(o.gstOnFee).gt(0) && <Row k={`GST on fee (${D(o.gstPercent).toString()}%)`} v={`− ${fmtInr(o.gstOnFee)}`} />}
        {D(o.reward).gt(0) && <Row k="Bonus reward" v={<span className="text-emerald-700">+ {fmtInr(o.reward)}</span>} />}
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
        <NetworkOnly nw={nw} n={n} />
        {breakdown}
        <div className="flex items-center gap-2">
          <Link href={`/orders/${o.id}`} className="btn btn-lg bg-brand-gradient flex-1 text-white shadow-lg shadow-brand-600/20 hover:opacity-95">Confirm and get deposit address</Link>
          <InfoTip>Changed your mind? Just leave. The quote expires on its own and nothing is charged.</InfoTip>
        </div>
      </div>
    );

  // ---------------------------------------------------------------- order
  const qr = waiting ? await depositQr(o.depositAddress) : null;
  const pIdx = progressIndex[o.status];
  const HeroIcon = o.status === "PAID" ? CheckCircle2 : o.status === "ON_HOLD" ? PauseCircle : ["EXPIRED", "CLOSED_MANUAL"].includes(o.status) ? XCircle : Hourglass;
  // Short hero text; the details live in the panels below.
  const heroBody =
    o.status === "QUOTE_READY" && waiting ? `Send ${amount} USDT before the timer ends. You'll receive ${fmtInr(o.net)}.`
    : o.status === "PAID" ? `${fmtInr(o.net)} sent to ${maskedPayout(snap)}.`
    : text.body;
  const heroTone = o.status === "PAID" ? "tile-emerald" : o.status === "ON_HOLD" ? "tile-amber" : ["EXPIRED", "CLOSED_MANUAL"].includes(o.status) ? "tile-slate" : "tile-blue";

  return (
    <div className="space-y-5">
      {/* Refresh on its own while something is still happening: every 15 s while waiting for the payment, every minute during review. */}
      {["QUOTE_READY", "PAYMENT_SUBMITTED"].includes(o.status) && <AutoRefresh />}
      {["PAYMENT_CONFIRMED", "UNDER_REVIEW", "APPROVED"].includes(o.status) && <AutoRefresh everyMs={60_000} />}
      <div className="flex items-center justify-between gap-3">
        <BackLink href="/orders">Orders</BackLink>
        <span className="text-xs text-slate-500">{o.id}</span>
      </div>

      <section className="card">
        <div className="flex items-center gap-3">
          <span className={`icon-tile ${heroTone} size-11 shadow-lg`}><HeroIcon className="size-5" aria-hidden /></span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5"><StatusPill status={o.status} /><NetworkBadge network={n} /></div>
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{text.title}</h1>
        <p className="mt-1 text-slate-600">{heroBody}</p>
        {pIdx !== undefined && <div className="mt-6"><Steps steps={PROGRESS} current={pIdx} failed={o.status === "ON_HOLD"} /></div>}
        {o.submittedTxid && (o.status === "PAYMENT_SUBMITTED" || (o.status === "ON_HOLD" && RECHECKABLE_HOLDS.includes(o.holdReason ?? ""))) && (
          <ApiForm action={`/api/orders/${o.id}/recheck`} className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200 ring-inset">
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-slate-500">Transaction ID</p>
              <p className="truncate font-mono text-xs text-slate-900">{o.submittedTxid}</p>
            </div>
            <button className="btn-secondary"><RefreshCw className="size-4" aria-hidden /> Re-check payment</button>
          </ApiForm>
        )}
        {(o.status === "EXPIRED" || (o.status === "QUOTE_READY" && !waiting)) && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link href="/sell" className="btn-primary">Start a new order</Link>
            <span className="inline-flex items-center gap-1 text-sm text-slate-500">Already paid? <InfoTip>Payments for this order are still matched for 24 hours after it expires.</InfoTip></span>
          </div>
        )}
        {o.status === "PAID" && (
          <div className="mt-6 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="text-sm">
              {o.utr && (
                <>
                  <p className="text-slate-500">Bank reference (UTR)</p>
                  <p className="font-mono font-semibold text-slate-900">{o.utr}</p>
                </>
              )}
              <p className={o.utr ? "mt-1 text-xs text-slate-500" : "font-medium text-slate-700"}>Paid {fmtIST(o.paidAt)}</p>
            </div>
            <a href={`/api/orders/${o.id}/receipt`} className="btn-primary"><Download className="size-4" aria-hidden /> Download receipt (PDF)</a>
          </div>
        )}
      </section>

      {waiting && (
        <section className="card space-y-5 ring-2 ring-brand-600/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow flex items-center gap-1">Send payment <InfoTip>We detect your payment on the blockchain automatically, usually within a few minutes. This page updates by itself, so there&apos;s no need to come back and confirm.</InfoTip></p>
              <p className="mt-1 text-sm text-slate-600">Time left to send</p>
            </div>
            <Countdown until={o.quoteExpiresAt.toISOString()} variant="ring" />
          </div>
          <NetworkOnly nw={nw} n={n} walletsRequired={s.wallet_registration === "REQUIRED"} />

          <PayWithWallet orderId={o.id} network={n} mode={s.network_mode} token={tokenContractFor(s, n)} to={o.depositAddress} amount={D(o.usdtAmount).toFixed()} decimals={NETWORK_INFO[n].decimals} wcProjectId={env.walletConnectProjectId ?? null} appName={s.brand_name} />

          <div>
            <p className="label flex items-center gap-1">Exact amount <InfoTip>Send exactly this amount, decimals included. If your exchange takes a withdrawal fee, add it on top so exactly {amount} USDT arrives.</InfoTip></p>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 ring-inset">
              <span className="money text-2xl text-slate-900 sm:text-3xl">{amount} USDT</span>
              <CopyButton text={D(o.usdtAmount).toFixed()} />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="label flex items-center gap-1">Deposit address <InfoTip>{nw} address. You pay the network fee in {NETWORK_INFO[n].feeCoin}.</InfoTip></p>
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 ring-inset">
                <span className="min-w-0 flex-1 font-mono text-sm break-all text-slate-900">{o.depositAddress}</span>
                <CopyButton text={o.depositAddress} />
              </div>
            </div>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={`QR code for the ${nw} deposit address`} className="mx-auto size-40 rounded-xl bg-[#fff] p-2 ring-1 ring-slate-200" />
            )}
          </div>

          <details className="group border-t border-slate-100 pt-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900">Paid but not showing?</summary>
            <ApiForm action={`/api/orders/${o.id}/txid`} className="mt-3 space-y-2">
              <label className="label" htmlFor="txid">Transaction ID</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input id="txid" name="txid" required className="input font-mono text-sm" placeholder="From your wallet or exchange" autoComplete="off" />
                <button className="btn-primary">Check this payment</button>
              </div>
            </ApiForm>
          </details>
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
          <Section title="Timeline" info="All times are Indian Standard Time.">
            <Timeline events={events} />
          </Section>
        </div>
      </div>
      {chat}
    </div>
  );
}

// The same few deposit addresses are drawn again and again: keep the images.
const qrCache = new Map<string, Promise<string>>();
function depositQr(address: string) {
  let q = qrCache.get(address);
  if (!q) {
    if (qrCache.size > 50) qrCache.clear();
    q = QRCode.toDataURL(address, { margin: 1, width: 240, color: { dark: "#0f172a" } });
    q.catch(() => qrCache.delete(address));
    qrCache.set(address, q);
  }
  return q;
}

/** One short safety line instead of paragraphs; the details sit behind the (i). */
function NetworkOnly({ nw, n, walletsRequired }: { nw: string; n: NetworkCode; walletsRequired?: boolean }) {
  return (
    <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-800 ring-1 ring-rose-200 ring-inset">
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">Send only USDT on {nw}</span>
      <InfoTip>
        Any other network or coin may be lost for good.{n === "BSC" ? " This is not an Ethereum (ERC-20) address, even though it looks similar." : ""}
        {walletsRequired ? " Send from a wallet listed under Account → Your wallets; payments from other wallets are held for a check." : ""}
      </InfoTip>
    </p>
  );
}
