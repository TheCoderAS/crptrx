import { AlertOctagon } from "lucide-react";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtUsdt } from "@/server/money";
import { explorerTxUrl, type Mode, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import type { Prisma } from "@prisma/client";
import { pickSort } from "@/lib/sort";
import { FilterMenu } from "@/components/FilterMenu";
import { ListToolbar } from "@/components/ListToolbar";
import { NetworkBadge, PageHeader, StatusPill } from "@/components/ui";
import { getSettings } from "@/server/settings";
import { allKnownDepositAddresses } from "@/server/deposit";
import { getAdapter } from "@/server/networks";
import Link from "next/link";

const SORTS = [
  { value: "new", label: "Newest first" },
  { value: "old", label: "Oldest first" },
  { value: "high", label: "Amount: high to low" },
  { value: "low", label: "Amount: low to high" },
] as const;
type Sort = (typeof SORTS)[number]["value"];
const ORDER_BY: Record<Sort, Prisma.IncomingTransferOrderByWithRelationInput> = { new: { blockTime: "desc" }, old: { blockTime: "asc" }, high: { amount: "desc" }, low: { amount: "asc" } };

export default async function Unmatched({ searchParams }: { searchParams: Promise<{ show?: string; q?: string; sort?: string }> }) {
  await adminOrLogin();
  const { show, q: rawQ, sort: sortParam } = await searchParams;
  const q = rawQ?.trim();
  const sort = pickSort(sortParam, SORTS.map((s) => s.value), "new");
  const search: Prisma.IncomingTransferWhereInput = q
    ? { OR: [{ txid: { contains: q, mode: "insensitive" } }, { fromAddress: { contains: q, mode: "insensitive" } }, { toAddress: { contains: q, mode: "insensitive" } }, ...(/^\d+(\.\d+)?$/.test(q) ? [{ amount: q }] : [])] }
    : {};
  const showHref = (v?: string) => `/admin/unmatched?${new URLSearchParams({ ...(v ? { show: v } : {}), ...(q ? { q } : {}), ...(sort !== "new" ? { sort } : {}) })}`;
  // Default: everything that didn't match an order (waiting, manual handling and wrong token).
  const status = show === "waiting" ? "UNMATCHED" : show === "manual" ? "MANUAL_HANDLING" : show === "ignored" ? "IGNORED_WRONG_TOKEN" : null;
  const [rows, s] = await Promise.all([prisma.incomingTransfer.findMany({ where: { status: status ?? { in: ["UNMATCHED", "MANUAL_HANDLING", "IGNORED_WRONG_TOKEN"] }, ...search }, orderBy: [ORDER_BY[sort], { blockTime: "desc" }], take: 200 }), getSettings()]);
  // For each payment waiting on an admin: orders it could belong to (same network and exact amount, no payment yet).
  const open = rows.filter((t) => t.status === "UNMATCHED" || t.status === "MANUAL_HANDLING");
  const [maybe, ourAddrs] = await Promise.all([
    open.length
      ? prisma.order.findMany({
          where: { OR: open.map((t) => ({ network: t.network, usdtAmount: t.amount })), txid: null, status: { in: ["QUOTE_READY", "PAYMENT_SUBMITTED", "EXPIRED", "ON_HOLD"] }, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
          select: { id: true, network: true, usdtAmount: true, status: true, user: { select: { email: true } } },
          orderBy: { createdAt: "desc" },
        })
      : [],
    Promise.all((["TRON", "BSC"] as const).map(async (n) => (await allKnownDepositAddresses(n)).map((a) => `${n}:${getAdapter(n).normalizeAddress(a)}`))),
  ]);
  const ours = new Set(ourAddrs.flat());
  const fromUs = (t: (typeof rows)[number]) => ours.has(`${t.network}:${getAdapter(t.network as NetworkCode).normalizeAddress(t.fromAddress)}`);
  const candidatesFor = (t: (typeof rows)[number]) => maybe.filter((o) => o.network === t.network && fmtUsdt(o.usdtAmount) === fmtUsdt(t.amount));

  return (
    <div className="space-y-4">
      <PageHeader title="Unmatched payments" subtitle="USDT that arrived but didn't match an order." icon={<AlertOctagon className="size-6" />} tile="tile-amber" />
      <ListToolbar placeholder="TxID, wallet address or amount" sorts={[...SORTS]} defaultSort="new">
        <FilterMenu items={[{ href: showHref(), label: "All", active: !status }, { href: showHref("waiting"), label: "Waiting", active: status === "UNMATCHED" }, { href: showHref("manual"), label: "Manual handling", active: status === "MANUAL_HANDLING" }, { href: showHref("ignored"), label: "Wrong token", active: status === "IGNORED_WRONG_TOKEN" }]} />
      </ListToolbar>
      {rows.length === 0 && <p className="muted">{q ? "Nothing matches your search." : "Nothing here."}</p>}
      {rows.map((t) => (
        <div key={t.id} className="card space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <NetworkBadge network={t.network} /><b>{fmtUsdt(t.amount)} USDT</b><StatusPill status={t.status} />
            <span className="text-xs text-slate-500">{fmtIST(t.blockTime)}</span>
          </div>
          <p className="text-xs break-all">TxID <a className="font-mono underline" target="_blank" rel="noreferrer" href={explorerTxUrl(t.network as NetworkCode, s.network_mode as Mode, t.txid)}>{t.txid}</a> #{t.transferPosition}</p>
          <p className="text-xs break-all">From <span className="font-mono">{t.fromAddress}</span> → to <span className="font-mono">{t.toAddress}</span></p>
          {t.status === "IGNORED_WRONG_TOKEN" && <p className="text-xs text-red-700">Token contract {t.tokenContract} is not the official USDT. Never matched.</p>}
          {(t.status === "UNMATCHED" || t.status === "MANUAL_HANDLING") && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset">
              <b>Why it wasn&apos;t matched: </b>
              {fromUs(t) ? "Sent from our own deposit address, so it isn't a customer's payment. Don't link it to an order." : (t.unmatchedReason ?? "Not recorded (this payment arrived before reasons were kept).")}
            </p>
          )}
          {(t.status === "UNMATCHED" || t.status === "MANUAL_HANDLING") && !fromUs(t) && candidatesFor(t).length > 0 && (
            <div className="text-sm">
              <p className="text-slate-500">Orders for exactly {fmtUsdt(t.amount)} USDT without a payment (last 7 days):</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {candidatesFor(t).map((o) => (
                  <li key={o.id}><Link href={`/admin/orders/${o.id}`} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-xs ring-1 ring-slate-200 hover:bg-slate-50">{o.id} <StatusPill status={o.status} /> <span className="font-sans text-slate-500">{o.user.email}</span></Link></li>
                ))}
              </ul>
            </div>
          )}
          {t.handlingNote && <p className="text-sm">Note: {t.handlingNote}</p>}
          {(t.status === "UNMATCHED" || t.status === "MANUAL_HANDLING") && (
            <div className="grid gap-2 md:grid-cols-2">
              <ApiForm action={`/api/admin/transfers/${t.id}`} className="space-y-2 rounded-lg bg-slate-50 p-2">
                <input type="hidden" name="action" value="link" />
                <input aria-label="Order ID, e.g. ORD-2026-000123" name="orderId" required className="input" placeholder="Order ID, e.g. ORD-2026-000123" />
                <input aria-label="Why this belongs to that order (required)" name="note" required className="input" placeholder="Why this belongs to that order (required)" />
                <button className="btn-secondary">Link to order</button>
              </ApiForm>
              {t.status === "UNMATCHED" && (
                <ApiForm action={`/api/admin/transfers/${t.id}`} className="space-y-2 rounded-lg bg-slate-50 p-2">
                  <input type="hidden" name="action" value="manual" />
                  <input aria-label="Note (required)" name="note" required className="input" placeholder="Note (required)" />
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
