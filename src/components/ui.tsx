import type { ReactNode } from "react";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";

export function NetworkBadge({ network, large }: { network: NetworkCode | string; large?: boolean }) {
  const info = NETWORK_INFO[network as NetworkCode];
  if (!info) return <span>{network}</span>;
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ring-1 ${info.badge} ${large ? "px-3 py-1 text-base" : "px-2 py-0.5 text-xs"}`}>
      {info.name}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  QUOTE_READY: "bg-blue-100 text-blue-800",
  EXPIRED: "bg-gray-200 text-gray-700",
  PAYMENT_SUBMITTED: "bg-indigo-100 text-indigo-800",
  PAYMENT_CONFIRMED: "bg-teal-100 text-teal-800",
  UNDER_REVIEW: "bg-purple-100 text-purple-800",
  ON_HOLD: "bg-orange-100 text-orange-800",
  APPROVED: "bg-lime-100 text-lime-800",
  PAID: "bg-green-100 text-green-800",
  CLOSED_MANUAL: "bg-gray-200 text-gray-700",
  SUBMITTED: "bg-indigo-100 text-indigo-800",
  NEEDS_CHANGES: "bg-orange-100 text-orange-800",
  DECLINED: "bg-red-100 text-red-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  NOT_STARTED: "bg-gray-200 text-gray-700",
  UNMATCHED: "bg-orange-100 text-orange-800",
  MANUAL_HANDLING: "bg-gray-200 text-gray-700",
  MATCHED: "bg-green-100 text-green-800",
  IGNORED_WRONG_TOKEN: "bg-red-100 text-red-800",
  ACTIVE: "bg-green-100 text-green-800",
  DISABLED: "bg-gray-200 text-gray-700",
};
export const statusLabel = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? "bg-gray-100"}`}>{label ?? statusLabel(status)}</span>;
}

export function Banner({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  const c = { info: "bg-blue-50 text-blue-900 ring-blue-200", warn: "bg-amber-50 text-amber-900 ring-amber-200", danger: "bg-red-50 text-red-900 ring-red-300", ok: "bg-green-50 text-green-900 ring-green-200" }[tone];
  return <div className={`rounded-lg p-3 text-sm ring-1 ${c}`}>{children}</div>;
}

export function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-gray-500">{k}</span>
      <span className="text-right font-medium break-all">{v}</span>
    </div>
  );
}

export function Timeline({ events }: { events: { id: string; toStatus: string; createdAt: Date; publicMessage: string | null; privateNote?: string | null; actorType?: string }[] }) {
  return (
    <ol className="relative border-l border-gray-200 pl-4">
      {events.map((e) => (
        <li key={e.id} className="mb-4">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-brand-600" />
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={e.toStatus} />
            <time className="text-xs text-gray-500">{fmtIST(e.createdAt)}</time>
            {e.actorType && <span className="text-xs text-gray-400">by {e.actorType.toLowerCase()}</span>}
          </div>
          {e.publicMessage && <p className="mt-1 text-sm text-gray-700">{e.publicMessage}</p>}
          {e.privateNote && <p className="mt-1 rounded bg-yellow-50 px-2 py-1 text-xs text-yellow-900">Private note: {e.privateNote}</p>}
        </li>
      ))}
    </ol>
  );
}
