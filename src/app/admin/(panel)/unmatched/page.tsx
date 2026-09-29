import Link from "next/link";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtUsdt } from "@/server/money";
import { explorerTxUrl, type Mode, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { NetworkBadge, StatusPill } from "@/components/ui";
import { getSettings } from "@/server/settings";

export default async function Unmatched({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await adminOrLogin();
  const { show } = await searchParams;
  const status = show === "manual" ? "MANUAL_HANDLING" : show === "ignored" ? "IGNORED_WRONG_TOKEN" : "UNMATCHED";
  const [rows, s] = await Promise.all([prisma.incomingTransfer.findMany({ where: { status }, orderBy: { blockTime: "desc" }, take: 200 }), getSettings()]);
  return (
    <div className="space-y-4">
      <h1 className="h1">Unmatched payments</h1>
      <div className="flex gap-2 text-sm">
        <Link className="underline" href="/admin/unmatched">Waiting</Link>
        <Link className="underline" href="/admin/unmatched?show=manual">Marked for manual handling</Link>
        <Link className="underline" href="/admin/unmatched?show=ignored">Ignored (wrong token)</Link>
      </div>
      <p className="muted">USDT that arrived at a deposit address but didn&apos;t match an order. Link it to an order (a note is required) or mark it for manual handling.</p>
      {rows.length === 0 && <p className="muted">Nothing here.</p>}
      {rows.map((t) => (
        <div key={t.id} className="card space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <NetworkBadge network={t.network} /><b>{fmtUsdt(t.amount)} USDT</b><StatusPill status={t.status} />
            <span className="text-xs text-slate-500">{fmtIST(t.blockTime)}</span>
          </div>
          <p className="text-xs break-all">TxID <a className="font-mono underline" target="_blank" rel="noreferrer" href={explorerTxUrl(t.network as NetworkCode, s.network_mode as Mode, t.txid)}>{t.txid}</a> #{t.transferPosition}</p>
          <p className="text-xs break-all">From <span className="font-mono">{t.fromAddress}</span> → to <span className="font-mono">{t.toAddress}</span></p>
          {t.status === "IGNORED_WRONG_TOKEN" && <p className="text-xs text-red-700">Token contract {t.tokenContract} is not the official USDT. Never matched.</p>}
          {t.handlingNote && <p className="text-sm">Note: {t.handlingNote}</p>}
          {(t.status === "UNMATCHED" || t.status === "MANUAL_HANDLING") && (
            <div className="grid gap-2 md:grid-cols-2">
              <ApiForm action={`/api/admin/transfers/${t.id}`} className="space-y-2 rounded-lg bg-slate-50 p-2">
                <input type="hidden" name="action" value="link" />
                <input name="orderId" required className="input" placeholder="Order ID, e.g. ORD-2026-000123" />
                <input name="note" required className="input" placeholder="Why this belongs to that order (required)" />
                <button className="btn-secondary">Link to order</button>
              </ApiForm>
              {t.status === "UNMATCHED" && (
                <ApiForm action={`/api/admin/transfers/${t.id}`} className="space-y-2 rounded-lg bg-slate-50 p-2">
                  <input type="hidden" name="action" value="manual" />
                  <input name="note" required className="input" placeholder="Note (required)" />
                  <button className="btn-secondary">Mark for manual handling</button>
                </ApiForm>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
