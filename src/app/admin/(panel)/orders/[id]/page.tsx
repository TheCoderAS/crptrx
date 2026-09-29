import Link from "next/link";
import { notFound } from "next/navigation";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { D, fmtInr, fmtUsdt } from "@/server/money";
import { fullAccountNumber, type PayoutSnapshot } from "@/server/payouts";
import { ALLOWED_NEXT } from "@/server/orders/stateMachine";
import { getSettings } from "@/server/settings";
import { explorerAddressUrl, explorerTxUrl, NETWORK_INFO, type Mode, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { TotpField } from "@/components/Totp";
import { Banner, NetworkBadge, Row, StatusPill, Timeline } from "@/components/ui";

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  await adminOrLogin();
  const { id } = await params;
  const o = await prisma.order.findUnique({
    where: { id },
    include: { user: true, events: { orderBy: { createdAt: "asc" } }, notes: { include: { admin: true }, orderBy: { createdAt: "asc" } }, transfers: true, support: { orderBy: { createdAt: "desc" } } },
  });
  if (!o) notFound();
  const [s, kyc, admins] = await Promise.all([
    getSettings(),
    prisma.kycSubmission.findFirst({ where: { userId: o.userId }, orderBy: { submittedAt: "desc" } }),
    prisma.admin.findMany({ select: { id: true, name: true } }),
  ]);
  const adminName = (aid: string | null) => admins.find((a) => a.id === aid)?.name ?? aid ?? "";
  const n = o.network as NetworkCode;
  const mode = o.networkMode as Mode;
  const snap = o.payoutSnapshot as unknown as PayoutSnapshot;
  const can = (to: string) => (ALLOWED_NEXT[o.status] as string[]).includes(to);
  // Every action posts to the same endpoint; the hidden "action" field picks it.
  const act = `/api/admin/orders/${o.id}`;
  const txLink = (t: string, net: NetworkCode = n) => <a className="font-mono text-xs text-brand-700 underline break-all" target="_blank" rel="noreferrer" href={explorerTxUrl(net, mode, t)}>{t}</a>;
  const nowIst = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 16);

  return (
    <div className="space-y-4">
      <Link href="/admin/orders" className="text-sm underline">← Orders</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="h1">{o.id}</h1>
        <StatusPill status={o.status} />
        <NetworkBadge network={n} large />
        {o.networkMode === "TEST" && <span className="rounded bg-amber-200 px-2 text-xs font-semibold">TEST</span>}
      </div>
      {o.status === "ON_HOLD" && <Banner tone="warn"><b>On hold:</b> {o.holdReason} {o.holdMessage}</Banner>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="h2 mb-2">Payment</h2>
          <Row k="Quote amount" v={`${fmtUsdt(o.usdtAmount)} USDT`} />
          <Row k="Network" v={NETWORK_INFO[n].name} />
          <Row k="Deposit address (saved on order)" v={<a className="font-mono text-xs underline" target="_blank" rel="noreferrer" href={explorerAddressUrl(n, mode, o.depositAddress)}>{o.depositAddress}</a>} />
          <Row k="Quote expires" v={fmtIST(o.quoteExpiresAt)} />
          {o.submittedTxid && <Row k="TxID submitted by user" v={txLink(o.submittedTxid, (o.submittedTxid.startsWith("0x") ? "BSC" : "TRON") as NetworkCode)} />}
          {o.txid && <Row k="Matched TxID" v={<>{txLink(o.txid)} <span className="text-xs text-slate-500">#{o.transferPosition}</span></>} />}
          {o.receivedAmount && <Row k="Amount received" v={<span className={D(o.receivedAmount).eq(D(o.usdtAmount)) ? "" : "text-red-700"}>{fmtUsdt(o.receivedAmount)} USDT</span>} />}
          {o.senderAddress && <Row k="Sender wallet" v={<a className="font-mono text-xs underline" target="_blank" rel="noreferrer" href={explorerAddressUrl(n, mode, o.senderAddress)}>{o.senderAddress}</a>} />}
          {o.confirmedAt && <Row k="Confirmed" v={fmtIST(o.confirmedAt)} />}
        </div>
        <div className="card">
          <h2 className="h2 mb-2">User</h2>
          <Row k="Email" v={<Link className="underline" href={`/admin/users/${o.userId}`}>{o.user.email}</Link>} />
          <Row k="Account" v={o.user.status} />
          <Row k="KYC" v={<StatusPill status={o.user.kycStatus} />} />
          <Row k="KYC name" v={kyc?.fullName ?? "—"} />
          <Row k="PAN" v={kyc?.panMasked ?? "—"} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="h2 mb-2">Amounts (frozen at quote time)</h2>
          <Row k="Rate" v={fmtInr(o.rate)} />
          <Row k="Gross" v={fmtInr(o.gross)} />
          <Row k={`Tax held (${D(o.taxPercent)}%)`} v={fmtInr(o.taxHeld)} />
          <Row k={`Fee (${D(o.feePercent)}%)`} v={fmtInr(o.fee)} />
          <Row k={`GST on fee (${D(o.gstPercent)}%)`} v={fmtInr(o.gstOnFee)} />
          <Row k={<b>Net to pay</b>} v={<span className="text-lg">{fmtInr(o.net)}</span>} />
        </div>
        <div className="card">
          <h2 className="h2 mb-2">Pay to (snapshot)</h2>
          <Row k="Type" v={snap.type} />
          <Row k="Holder" v={snap.holderName} />
          {snap.type === "BANK" ? <><Row k="Account number" v={fullAccountNumber(snap)} /><Row k="IFSC" v={snap.ifsc} /></> : <Row k="UPI ID" v={snap.upiId} />}
          {o.utr && <><Row k="UTR" v={o.utr} /><Row k="Paid" v={`${fmtInr(o.paidAmount ?? 0)} at ${fmtIST(o.paidAt)} by ${adminName(o.paidByAdminId)}`} /><a className="btn-secondary mt-2" href={`/api/orders/${o.id}/receipt`}>Receipt PDF</a></>}
          {o.resolutionNote && <Row k="Resolution" v={o.resolutionNote} />}
          {o.returnTxid && <Row k="Return TxID" v={o.returnTxid} />}
        </div>
      </div>

      {!["PAID", "CLOSED_MANUAL", "EXPIRED", "QUOTE_READY"].includes(o.status) && (
        <div className="card space-y-3">
          <h2 className="h2">Wallet check (required before approval)</h2>
          {o.walletCheckResult && <Banner tone={o.walletCheckResult === "CLEAN" ? "ok" : "danger"}><b>{o.walletCheckResult}</b> by {adminName(o.walletCheckedBy)}: {o.walletCheckNote}</Banner>}
          <ApiForm action={act} className="space-y-2">
            <input type="hidden" name="action" value="wallet_check" />
            <p className="muted">Check the sender wallet {o.senderAddress ? <code>{o.senderAddress}</code> : ""} in your scam-check tool and paste the result.</p>
            <textarea name="note" required rows={3} className="input" defaultValue={o.walletCheckNote ?? ""} placeholder="Paste the check result" />
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1"><input type="radio" name="result" value="CLEAN" required defaultChecked={o.walletCheckResult === "CLEAN"} /> Clean</label>
              <label className="flex items-center gap-1"><input type="radio" name="result" value="SUSPICIOUS" defaultChecked={o.walletCheckResult === "SUSPICIOUS"} /> Suspicious</label>
            </div>
            <button className="btn-secondary">Save wallet check</button>
          </ApiForm>
        </div>
      )}

      {["PAYMENT_CONFIRMED", "UNDER_REVIEW", "ON_HOLD", "APPROVED", "PAYMENT_SUBMITTED"].includes(o.status) && (
      <div className="card space-y-4">
        <h2 className="h2">Actions</h2>
        <div className="flex flex-wrap gap-3">
          {o.status === "PAYMENT_CONFIRMED" && <ApiForm action={act}><input type="hidden" name="action" value="start_review" /><button className="btn-primary">Start review</button></ApiForm>}
          {o.status === "UNDER_REVIEW" && <ApiForm action={act} confirm={`Approve ${o.id} for ${fmtInr(o.net)}?`}><input type="hidden" name="action" value="approve" /><button className="btn-primary" disabled={!o.walletCheckResult}>Approve</button></ApiForm>}
          {o.status === "ON_HOLD" && <ApiForm action={act}><input type="hidden" name="action" value="release" /><button className="btn-secondary">Release from hold</button></ApiForm>}
        </div>
        {o.status === "APPROVED" && (
          <ApiForm action={act} className="space-y-2 rounded-lg bg-green-50 p-3">
            <h3 className="font-semibold">Mark as paid</h3>
            <p className="muted">Pay {fmtInr(o.net)} from the company bank account first, then record it here.</p>
            <input type="hidden" name="action" value="mark_paid" />
            <div className="grid gap-2 sm:grid-cols-3">
              <div><label className="label">UTR (12–22 letters/numbers)</label><input name="utr" required pattern="[A-Za-z0-9]{12,22}" className="input" /></div>
              <div><label className="label">Amount paid (must be {D(o.net).toFixed(2)})</label><input name="amount" required inputMode="decimal" className="input" /></div>
              <div><label className="label">Paid at (IST)</label><input name="paidAt" type="datetime-local" required defaultValue={nowIst} className="input" /></div>
            </div>
            <TotpField />
            <button className="btn-primary">Mark as paid</button>
          </ApiForm>
        )}
        {can("ON_HOLD") && (
          <ApiForm action={act} className="space-y-2 rounded-lg bg-orange-50 p-3">
            <h3 className="font-semibold">Put on hold</h3>
            <input type="hidden" name="action" value="hold" />
            <select name="reason" required className="input">{s.hold_reasons.map((r) => <option key={r}>{r}</option>)}</select>
            <input name="message" className="input" placeholder="Message shown to the user (optional)" />
            <input name="note" className="input" placeholder="Private note (admins only)" />
            <button className="btn-secondary">Put on hold</button>
          </ApiForm>
        )}
        {o.status === "ON_HOLD" && (
          <ApiForm action={act} className="space-y-2 rounded-lg bg-slate-50 p-3" confirm="Close this order? This is final.">
            <h3 className="font-semibold">Close hold (resolved outside the app)</h3>
            <input type="hidden" name="action" value="close_manual" />
            <textarea name="resolutionNote" required rows={2} className="input" placeholder="How it was resolved (required)" />
            <input name="returnTxid" className="input font-mono" placeholder="Return TxID, if USDT was sent back" />
            <button className="btn-danger">Close order</button>
          </ApiForm>
        )}
      </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="h2 mb-3">Timeline (with private notes)</h2>
          <Timeline events={o.events} />
        </div>
        <div className="card space-y-3">
          <h2 className="h2">Admin notes</h2>
          {o.notes.map((nt) => <p key={nt.id} className="text-sm"><b>{nt.admin.name}</b> <span className="text-xs text-slate-500">{fmtIST(nt.createdAt)}</span><br />{nt.note}</p>)}
          <ApiForm action={act} className="space-y-2" resetOnSuccess>
            <input type="hidden" name="action" value="note" />
            <textarea name="note" required rows={2} className="input" placeholder="Add a private note" />
            <button className="btn-secondary">Add note</button>
          </ApiForm>
          {o.support.length > 0 && <>
            <h2 className="h2">Support messages</h2>
            {o.support.map((m) => <p key={m.id} className="text-sm"><span className="text-xs text-slate-500">{fmtIST(m.createdAt)}</span><br />{m.message}{m.attachmentKey && <> · <a className="underline" target="_blank" rel="noreferrer" href={`/api/admin/support/${m.id}/file`}>attachment</a></>}</p>)}
          </>}
        </div>
      </div>
    </div>
  );
}
