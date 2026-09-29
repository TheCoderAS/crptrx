import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Order } from "@prisma/client";
import { fmtInr, fmtUsdt } from "@/server/money";
import { fmtIST } from "@/lib/time";
import { NetworkMark, StatusPill } from "./ui";

/** Tappable order rows, used on the dashboard and the orders page. */
export function OrderList({ orders }: { orders: Order[] }) {
  return (
    <ul className="-mx-2 divide-y divide-slate-100">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className="flex items-center gap-3 rounded-xl px-2 py-3.5 transition hover:bg-slate-50">
            <NetworkMark network={o.network} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="money truncate text-slate-900">{fmtUsdt(o.usdtAmount)} USDT</p>
                <p className="money text-slate-900">{fmtInr(o.net)}</p>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p className="truncate text-xs text-slate-500">{fmtIST(o.createdAt)} · {o.id}</p>
                <StatusPill status={o.status} />
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
