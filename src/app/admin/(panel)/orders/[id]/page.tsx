import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Download, PauseCircle, RefreshCw, ShieldAlert, ShieldCheck, StickyNote, XCircle } from "lucide-react";
import { paymentProblem } from "@/server/orders/actions";
import { isRegisteredWallet, RECHECKABLE_HOLDS } from "@/server/matching";
import { currentDepositAddresses } from "@/server/deposit";
import { getAdapter } from "@/server/networks";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { D, fmtInr, fmtUsdt } from "@/server/money";
import { fullAccountNumber, type PayoutSnapshot } from "@/server/payouts";
import { ALLOWED_NEXT } from "@/server/orders/stateMachine";
import { getSettings } from "@/server/settings";
import { explorerAddressUrl, explorerTxUrl, NETWORK_INFO, type Mode, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { CopyButton } from "@/components/CopyButton";
import { ModalForm } from "@/components/Modal";
import { Select } from "@/components/Select";
import { AdminOrderChat } from "@/components/chat/AdminOrderChat";
import { BackLink, NetworkBadge, Row, StatusPill, Timeline } from "@/components/ui";

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  await adminOrLogin();
  const { id } = await params;
  const o = await prisma.order.findUnique({
    where: { id },
    include: { user: true, events: { orderBy: { createdAt: "asc" } }, notes: { include: { admin: true }, orderBy: { createdAt: "asc" } }, transfers: true, supportThread: true },
  });
  if (!o) notFound();
  const [s, kyc, admins, senderKnown] = await Promise.all([
    getSettings(),
    prisma.kycSubmission.findFirst({ where: { userId: o.userId }, orderBy: { submittedAt: "desc" } }),
    prisma.admin.findMany({ select: { id: true, name: true } }),
    o.senderAddress ? isRegisteredWallet(prisma, o.userId, o.network as NetworkCode, o.senderAddress) : Promise.resolve(false),
  ]);
  // Payments that arrived but weren't matched and could be this order's: the TxID
  // the customer gave, or the exact amount on the same network in the last 7 days.
  const linkable = !o.txid && ["QUOTE_READY", "EXPIRED", "PAYMENT_SUBMITTED", "ON_HOLD"].includes(o.status);
  const [possible, ourAddrs] = linkable
    ? await Promise.all([
        prisma.incomingTransfer.findMany({
          where: {
            status: { in: ["UNMATCHED", "MANUAL_HANDLING"] },
            OR: [...(o.submittedTxid ? [{ txid: o.submittedTxid }] : []), { network: o.network, amount: o.usdtAmount, blockTime: { gte: new Date(o.createdAt.getTime() - 3600_000) } }],
          },
          orderBy: { blockTime: "desc" },
          take: 10,
        }),
        currentDepositAddresses(o.network as NetworkCode),
      ])
    : [[], []];
  const ours = new Set(ourAddrs.map((x) => getAdapter(o.network as NetworkCode).normalizeAddress(x)));
  // The customer's own wallets: registered on their account, or used to pay an earlier order.
  const norm = (x: string) => getAdapter(o.network as NetworkCode).normalizeAddress(x);
  const [myWallets, myPast] = possible.length
    ? await Promise.all([
        prisma.userWallet.findMany({ where: { userId: o.userId, network: o.network, deletedAt: null }, select: { address: true } }),
        prisma.order.findMany({ where: { userId: o.userId, network: o.network, senderAddress: { not: null } }, select: { senderAddress: true }, distinct: ["senderAddress"] }),
      ])
    : [[], []];
  const registered = new Set(myWallets.map((w) => norm(w.address)));
  const usedBefore = new Set(myPast.map((p) => norm(p.senderAddress!)));
  const payProblem = paymentProblem(o);
  const adminName = (aid: string | null) => admins.find((a) => a.id === aid)?.name ?? aid ?? "";
  const n = o.network as NetworkCode;
  const mode = o.networkMode as Mode;
  const snap = o.payoutSnapshot as unknown as PayoutSnapshot;
  const can = (to: string) => (ALLOWED_NEXT[o.status] as string[]).includes(to);
  // Every action posts to the same endpoint; the hidden "action" field picks it.
  const act = `/api/admin/orders/${o.id}`;
  const txLink = (t: string, net: NetworkCode = n) => <a className="font-mono text-xs text-brand-700 underline break-all" target="_blank" rel="noreferrer" href={explorerTxUrl(net, mode, t)}>{t}</a>;
  const nowIst = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 16);
  const canRecheck = !!o.submittedTxid && (o.status === "PAYMENT_SUBMITTED" || (o.status === "ON_HOLD" && RECHECKABLE_HOLDS.includes(o.holdReason ?? "")));
  const account = snap.type === "BANK" ? fullAccountNumber(snap) : snap.upiId;

  // Rare actions live behind small buttons that open a dialog, not as open forms.
  const holdButton = (label: ReactNode, className = "btn-ghost min-h-9 px-3 text-sm text-amber-800 hover:bg-amber-50") =>
    can("ON_HOLD") && (
      <ModalForm button={label} buttonClassName={className} title="Put this order on hold" description="The customer sees the reason and your message. Nothing is paid while it's on hold." action={act} submitLabel="Put on hold">
        <input type="hidden" name="action" value="hold" />
        <div><label className="label" htmlFor="hold-reason">Reason</label><Select id="hold-reason" name="reason" options={s.hold_reasons.map((r) => ({ value: r, label: r }))} /></div>
        <div><label className="label" htmlFor="hold-message">Message to the customer (optional)</label><input id="hold-message" name="message" className="input" /></div>
        <div><label className="label" htmlFor="hold-note">Private note (admins only)</label><input id="hold-note" name="note" className="input" /></div>
      </ModalForm>
    );

  const walletForm = (
    <>
      <input type="hidden" name="action" value="wallet_check" />
      {o.senderAddress && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200 ring-inset">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-900">{o.senderAddress}</span>
          <CopyButton text={o.senderAddress} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="wc-note">Result from your scam-check tool</label>
        <textarea id="wc-note" name="note" required rows={2} className="input" defaultValue={o.walletCheckNote ?? ""} placeholder="Paste the result" />
      </div>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Result</legend>
        {(["CLEAN", "SUSPICIOUS"] as const).map((r) => (
          <label key={r} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ring-1 transition has-[:checked]:ring-2 ${r === "CLEAN" ? "ring-slate-200 has-[:checked]:bg-emerald-50 has-[:checked]:text-emerald-800 has-[:checked]:ring-emerald-500" : "ring-slate-200 has-[:checked]:bg-rose-50 has-[:checked]:text-rose-800 has-[:checked]:ring-rose-500"}`}>
            <input type="radio" name="result" value={r} required defaultChecked={o.walletCheckResult === r} className="sr-only" />
            {r === "CLEAN" ? <ShieldCheck className="size-4" aria-hidden /> : <ShieldAlert className="size-4" aria-hidden />}
            {r === "CLEAN" ? "Clean" : "Suspicious"}
          </label>
        ))}
      </fieldset>
    </>
  );

  return (
    <div className="space-y-4">
      <BackLink href="/admin/orders">Orders</BackLink>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="h1">{o.id}</h1>
            <StatusPill status={o.status} />
            <NetworkBadge network={n} />
            {o.networkMode === "TEST" && <span className="rounded bg-amber-200 px-2 text-xs font-semibold text-amber-950">TEST</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">{fmtUsdt(o.usdtAmount)} USDT from <Link className="underline" href={`/admin/users/${o.userId}`}>{o.user.email}</Link></p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">{o.status === "PAID" ? "Paid" : "To pay"}</p>
          <p className="money text-2xl text-slate-900">{fmtInr(o.net)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {/* The one thing to do next. Changes with the order's status. */}
          <section className="card space-y-4 ring-2 ring-brand-600/15">
            {possible.length > 0 && (
              <div className="space-y-2 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200 ring-inset">
                <p className="text-sm font-semibold text-amber-900">{possible.length === 1 ? "A payment that may be this order's arrived but wasn't matched" : `${possible.length} payments that may be this order's arrived but weren't matched`}</p>
                <p className="text-xs text-amber-900/80">Check the sender and amount, then confirm the one that belongs to this order. The order moves to &ldquo;Payment received&rdquo;.</p>
                <ul className="space-y-2">
                  {possible.map((t) => {
                    const fromUs = ours.has(norm(t.fromAddress));
                    const theirTx = !!o.submittedTxid && t.txid.toLowerCase() === o.submittedTxid.toLowerCase();
                    return (
                      <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-amber-200">
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="font-medium text-slate-900">
                            {fmtUsdt(t.amount)} USDT · {fmtIST(t.blockTime)}
                            {theirTx && <span className="ml-2 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">TxID the customer gave</span>}
                          </p>
                          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span className="min-w-0 truncate">From <span className="font-mono">{t.fromAddress}</span></span>
                            {registered.has(norm(t.fromAddress)) ? (
                              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">Customer&apos;s registered wallet</span>
                            ) : usedBefore.has(norm(t.fromAddress)) ? (
                              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">Customer paid from it before</span>
                            ) : (
                              !ours.has(norm(t.fromAddress)) && <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">Not linked to this customer</span>
                            )}
                          </p>
                          <p className="truncate text-xs">{txLink(t.txid, t.network as NetworkCode)}</p>
                          {fromUs && <p className="mt-1 text-xs font-medium text-rose-700">Sent from our own deposit wallet. Not a customer payment: don&apos;t confirm it.</p>}
                          {!fromUs && t.unmatchedReason && <p className="mt-1 text-xs text-slate-500">Not matched automatically: {t.unmatchedReason}</p>}
                        </div>
                        {!fromUs && (
                          <ModalForm button="Confirm for this order" buttonClassName="btn-primary min-h-9 px-3 text-sm" title={`Confirm this payment for ${o.id}?`} description={`${fmtUsdt(t.amount)} USDT from ${t.fromAddress}. The order moves to Payment received.`} action={`/api/admin/transfers/${t.id}`} submitLabel="Confirm payment">
                            <input type="hidden" name="action" value="link" />
                            <input type="hidden" name="orderId" value={o.id} />
                            <div><label className="label" htmlFor={`why-${t.id}`}>Why it&apos;s this order&apos;s (logged)</label><textarea id={`why-${t.id}`} name="note" required rows={2} className="input" placeholder="e.g. Customer confirmed the sending wallet; amount and time match" /></div>
                          </ModalForm>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {(o.status === "QUOTE_READY" || o.status === "EXPIRED") && (
              <NextStep icon={<Clock className="size-5" />} tile="tile-slate" title={o.status === "EXPIRED" ? "Quote expired without a payment" : "Waiting for the customer to pay"}>
                Nothing to do yet. A payment that arrives is matched automatically{o.status === "EXPIRED" ? " for 24 hours after expiry" : ""}.
              </NextStep>
            )}

            {o.status === "PAYMENT_SUBMITTED" && (
              <NextStep icon={<RefreshCw className="size-5" />} tile="tile-blue" title="Checking the customer's transaction ID" actions={<>{canRecheck && <ApiForm action={act}><input type="hidden" name="action" value="recheck" /><button className="btn-primary">Re-check on blockchain</button></ApiForm>}{holdButton("Put on hold")}</>}>
                We look it up automatically. Re-check if you&apos;ve just fixed a setting.
              </NextStep>
            )}

            {o.status === "PAYMENT_CONFIRMED" && (
              <NextStep icon={<CheckCircle2 className="size-5" />} tile="tile-emerald" title="Payment received. Start the review." actions={<><ApiForm action={act}><input type="hidden" name="action" value="start_review" /><button className="btn-primary">Start review</button></ApiForm>{holdButton("Put on hold")}</>}>
                {fmtUsdt(o.receivedAmount ?? o.usdtAmount)} USDT arrived. Starting the review shows it as &ldquo;In review&rdquo; to the customer.
              </NextStep>
            )}

            {o.status === "UNDER_REVIEW" && (
              <>
                <NextStep icon={<ShieldCheck className="size-5" />} tile="tile-violet" title="Review: check the wallet, then approve" actions={holdButton("Put on hold")} />
                <ol className="space-y-3">
                  <li className="rounded-xl p-4 ring-1 ring-slate-200">
                    <StepHead n={1} done={!!o.walletCheckResult} title="Wallet check" />
                    {o.walletCheckResult ? (
                      <div className="mt-2 flex flex-wrap items-start gap-3">
                        <p className={`min-w-0 flex-1 text-sm ${o.walletCheckResult === "CLEAN" ? "text-emerald-800" : "text-rose-800"}`}>
                          <b>{o.walletCheckResult === "CLEAN" ? "Clean" : "Suspicious"}</b> · {adminName(o.walletCheckedBy)}: {o.walletCheckNote}
                        </p>
                        <ModalForm button="Change" buttonClassName="btn-ghost min-h-8 px-2.5 text-xs" title="Wallet check" description="Check the sender wallet in your scam-check tool." action={act} submitLabel="Save wallet check">{walletForm}</ModalForm>
                      </div>
                    ) : (
                      <ApiForm action={act} className="mt-3 space-y-3">
                        {walletForm}
                        <button className="btn-secondary">Save wallet check</button>
                      </ApiForm>
                    )}
                  </li>
                  <li className={`rounded-xl p-4 ring-1 ring-slate-200 ${o.walletCheckResult ? "" : "opacity-60"}`}>
                    <StepHead n={2} done={false} title={`Approve ${fmtInr(o.net)}`} />
                    {o.walletCheckResult === "SUSPICIOUS" && <p className="mt-2 text-sm text-rose-700">The wallet looked suspicious. Usually you&apos;d put this on hold instead.</p>}
                    {!payProblem ? (
                      <ApiForm action={act} className="mt-3" confirm={`Approve ${o.id} for ${fmtInr(o.net)}?`}>
                        <input type="hidden" name="action" value="approve" />
                        <button className="btn-primary" disabled={!o.walletCheckResult}>Approve</button>
                        {!o.walletCheckResult && <span className="ml-3 text-xs text-slate-500">Save the wallet check first.</span>}
                      </ApiForm>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm font-medium text-rose-800">{payProblem}</p>
                        <p className="text-sm text-slate-600">The payout stays {fmtInr(o.net)}. Usually you&apos;d put this on hold and sort it out with the customer.</p>
                        <ModalForm button="Approve anyway…" buttonClassName="btn-danger" title="Approve even though the payment doesn't match?" description={payProblem} action={act} submitLabel="Approve anyway">
                          <input type="hidden" name="action" value="approve" />
                          <div>
                            <label className="label" htmlFor="overrideNote">Why? (logged)</label>
                            <textarea id="overrideNote" name="overrideNote" required minLength={10} rows={3} className="input" placeholder="e.g. Customer sent the missing 0.37 USDT in tx 0x…, checked on explorer" />
                          </div>
                        </ModalForm>
                      </div>
                    )}
                  </li>
                </ol>
              </>
            )}

            {o.status === "APPROVED" && (
              <>
                <NextStep icon={<CheckCircle2 className="size-5" />} tile="tile-emerald" title={`Pay ${fmtInr(o.net)}, then record it`}>
                  Send it from the company bank account to the details below, then enter the bank reference.
                </NextStep>
                <div className="grid gap-2 rounded-xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200 ring-inset sm:grid-cols-2">
                  <p><span className="block text-xs text-slate-500">Name</span><span className="font-medium text-slate-900">{snap.holderName}</span></p>
                  <p><span className="block text-xs text-slate-500">{snap.type === "BANK" ? "Account number" : "UPI ID"}</span><span className="inline-flex items-center gap-2 font-mono text-slate-900">{account} {account && <CopyButton text={account} />}</span></p>
                  {snap.type === "BANK" && <p><span className="block text-xs text-slate-500">IFSC</span><span className="inline-flex items-center gap-2 font-mono text-slate-900">{snap.ifsc} {snap.ifsc && <CopyButton text={snap.ifsc} />}</span></p>}
                  <p><span className="block text-xs text-slate-500">Amount</span><span className="inline-flex items-center gap-2 font-semibold text-slate-900">{fmtInr(o.net)} <CopyButton text={D(o.net).toFixed(2)} /></span></p>
                </div>
                <ApiForm action={act} className="space-y-3" confirm={`Record ${fmtInr(o.net)} as paid for ${o.id}? The customer is told at once.`}>
                  <input type="hidden" name="action" value="mark_paid" />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div><label className="label" htmlFor="utr">UTR / bank reference</label><input id="utr" name="utr" required pattern="[A-Za-z0-9]{12,22}" className="input font-mono" placeholder="12–22 characters" /></div>
                    <div><label className="label" htmlFor="paid-amount">Amount paid</label><input id="paid-amount" name="amount" required inputMode="decimal" className="input" placeholder={D(o.net).toFixed(2)} /></div>
                    <div><label className="label" htmlFor="paidAt">Paid at (IST)</label><input id="paidAt" name="paidAt" type="datetime-local" required defaultValue={nowIst} className="input" /></div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button className="btn-primary">Mark as paid</button>
                    {holdButton("Problem with this payout? Put on hold", "text-sm font-medium text-amber-800 hover:underline")}
                  </div>
                </ApiForm>
              </>
            )}

            {o.status === "ON_HOLD" && (
              <NextStep
                icon={<PauseCircle className="size-5" />}
                tile="tile-amber"
                title="On hold"
                actions={
                  <>
                    <ApiForm action={act}><input type="hidden" name="action" value="release" /><button className="btn-primary">Release to review</button></ApiForm>
                    {canRecheck && <ApiForm action={act}><input type="hidden" name="action" value="recheck" /><button className="btn-secondary">Re-check on blockchain</button></ApiForm>}
                    <ModalForm button="Close order…" buttonClassName="btn-ghost min-h-9 px-3 text-sm text-rose-700 hover:bg-rose-50" title="Close this order" description="Final. Use it when the problem was resolved outside the app, e.g. USDT sent back." action={act} submitLabel="Close order">
                      <input type="hidden" name="action" value="close_manual" />
                      <div><label className="label" htmlFor="resolutionNote">How it was resolved</label><textarea id="resolutionNote" name="resolutionNote" required rows={3} className="input" /></div>
                      <div><label className="label" htmlFor="returnTxid">Return TxID (if USDT was sent back)</label><input id="returnTxid" name="returnTxid" className="input font-mono" /></div>
                    </ModalForm>
                  </>
                }
              >
                <b>{o.holdReason}</b> {o.holdMessage}
              </NextStep>
            )}

            {o.status === "PAID" && (
              <NextStep icon={<CheckCircle2 className="size-5" />} tile="tile-emerald" title={`Paid ${fmtInr(o.paidAmount ?? o.net)}`} actions={<a className="btn-secondary" href={`/api/orders/${o.id}/receipt`}><Download className="size-4" aria-hidden /> Receipt PDF</a>}>
                UTR <span className="font-mono">{o.utr}</span> · {fmtIST(o.paidAt)} · by {adminName(o.paidByAdminId)}
              </NextStep>
            )}

            {o.status === "CLOSED_MANUAL" && (
              <NextStep icon={<XCircle className="size-5" />} tile="tile-slate" title="Closed">
                {o.resolutionNote}{o.returnTxid && <> · Return TxID <span className="font-mono">{o.returnTxid}</span></>}
              </NextStep>
            )}
          </section>

          <section className="card">
            <h2 className="h2 mb-2">Payment</h2>
            <Row k="Quote amount" v={`${fmtUsdt(o.usdtAmount)} USDT`} />
            {o.receivedAmount && <Row k="Amount received" v={<span className={D(o.receivedAmount).eq(D(o.usdtAmount)) ? "" : "text-red-700"}>{fmtUsdt(o.receivedAmount)} USDT</span>} />}
            <Row k="Network" v={NETWORK_INFO[n].name} />
            <Row k="Deposit address" v={<a className="font-mono text-xs underline break-all" target="_blank" rel="noreferrer" href={explorerAddressUrl(n, mode, o.depositAddress)}>{o.depositAddress}</a>} />
            {o.senderAddress && (
              <Row
                k="Sender wallet"
                v={
                  <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                    <a className="font-mono text-xs break-all underline" target="_blank" rel="noreferrer" href={explorerAddressUrl(n, mode, o.senderAddress)}>{o.senderAddress}</a>
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${senderKnown ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-50 text-slate-600 ring-slate-200"}`}>{senderKnown ? "Registered by user" : "Not registered"}</span>
                  </span>
                }
              />
            )}
            {o.submittedTxid && <Row k="TxID from customer" v={txLink(o.submittedTxid, (o.submittedTxid.startsWith("0x") ? "BSC" : "TRON") as NetworkCode)} />}
            {o.txid && <Row k="Matched TxID" v={<>{txLink(o.txid)} <span className="text-xs text-slate-500">#{o.transferPosition}</span></>} />}
            <Row k="Quote expires" v={fmtIST(o.quoteExpiresAt)} />
            {o.confirmedAt && <Row k="Confirmed" v={fmtIST(o.confirmedAt)} />}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="card">
              <h2 className="h2 mb-2">Amounts</h2>
              <Row k="Rate" v={fmtInr(o.rate)} />
              <Row k="Gross" v={fmtInr(o.gross)} />
              {D(o.taxHeld).gt(0) && <Row k={`Tax held (${D(o.taxPercent)}%)`} v={`– ${fmtInr(o.taxHeld)}`} />}
              {D(o.fee).gt(0) && <Row k={`Fee (${D(o.feePercent)}%)`} v={`– ${fmtInr(o.fee)}`} />}
              {D(o.gstOnFee).gt(0) && <Row k={`GST on fee (${D(o.gstPercent)}%)`} v={`– ${fmtInr(o.gstOnFee)}`} />}
              <Row k={<b>Net to pay</b>} v={<b>{fmtInr(o.net)}</b>} />
            </section>
            <section className="card">
              <h2 className="h2 mb-2">Pay to</h2>
              <Row k="Type" v={snap.type === "BANK" ? "Bank account" : "UPI"} />
              <Row k="Name" v={snap.holderName} />
              {snap.type === "BANK" ? <><Row k="Account number" v={fullAccountNumber(snap)} /><Row k="IFSC" v={snap.ifsc} /></> : <Row k="UPI ID" v={snap.upiId} />}
              <p className="mt-2 text-xs text-slate-500">Saved when the order was placed.</p>
            </section>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <section className="card">
            <h2 className="h2 mb-2">Customer</h2>
            <Row k="Email" v={<Link className="underline break-all" href={`/admin/users/${o.userId}`}>{o.user.email}</Link>} />
            <Row k="Account" v={o.user.status === "ACTIVE" ? "Active" : o.user.status} />
            <Row k="KYC" v={<StatusPill status={o.user.kycStatus} />} />
            <Row k="Name on ID" v={kyc?.fullName ?? "—"} />
            <Row k="PAN" v={kyc?.panMasked ?? "—"} />
          </section>

          <section className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="h2">Admin notes</h2>
              <ModalForm button={<><StickyNote className="size-4" aria-hidden /> Add note</>} buttonClassName="btn-ghost min-h-9 px-3 text-sm" title="Add a private note" description="Only admins see notes." action={act} submitLabel="Add note">
                <input type="hidden" name="action" value="note" />
                <textarea aria-label="Note" name="note" required rows={3} className="input" />
              </ModalForm>
            </div>
            {o.notes.length === 0 ? <p className="text-sm text-slate-500">No notes yet.</p> : o.notes.map((nt) => (
              <p key={nt.id} className="text-sm"><b>{nt.admin.name}</b> <span className="text-xs text-slate-500">{fmtIST(nt.createdAt)}</span><br />{nt.note}</p>
            ))}
          </section>

          <section className="card">
            <h2 className="h2 mb-3">Timeline</h2>
            <Timeline events={o.events} />
          </section>
        </div>
      </div>
      <AdminOrderChat
        orderId={o.id}
        customer={o.user.email}
        startUnread={!!o.supportThread && o.supportThread.lastFrom === "USER" && (!o.supportThread.adminReadAt || o.supportThread.adminReadAt < o.supportThread.lastMessageAt)}
      />
    </div>
  );
}

function NextStep({ icon, tile, title, children, actions }: { icon: ReactNode; tile: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <span className={`icon-tile ${tile} size-10 shrink-0`}>{icon}</span>
      <div className="min-w-0 flex-1 basis-60">
        <h2 className="h2">{title}</h2>
        {children && <p className="mt-0.5 text-sm text-slate-600">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

function StepHead({ n, done, title }: { n: number; done: boolean; title: string }) {
  return (
    <p className="flex items-center gap-2 font-medium text-slate-900">
      <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"}`}>{done ? <CheckCircle2 className="size-3.5" aria-hidden /> : n}</span>
      {title}
    </p>
  );
}
