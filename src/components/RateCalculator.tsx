"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { calculatePayout, feeLabel, fmtInr } from "@/server/money";

interface Props {
  rate: string;
  taxPercent: string;
  feePercent: string;
  gstEnabled: boolean;
  gstPercent: string;
  feeMin?: string;
  feeMax?: string;
  stale: boolean;
  live: boolean;
}

/** Landing-page estimate: USDT in, rupees out, with every deduction shown. */
export function RateCalculator(p: Props) {
  const [usdt, setUsdt] = useState("100");
  const cfg = { rate: p.rate, taxPercent: p.taxPercent, feePercent: p.feePercent, gstEnabled: p.gstEnabled, gstPercent: p.gstPercent, feeMin: p.feeMin, feeMax: p.feeMax };
  const out = useMemo(() => {
    if (!/^\d+(\.\d{1,2})?$/.test(usdt) || Number(usdt) <= 0) return null;
    return calculatePayout({ usdt, ...cfg });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usdt]);

  return (
    <div className="ring-gradient relative rounded-3xl shadow-[var(--shadow-float)]">
      <div className="rounded-t-3xl border-b border-slate-100 bg-gradient-to-br from-brand-50 via-white to-accent/5 p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-500">Today&apos;s rate</p>
          {p.live && !p.stale && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
            Live
          </span>}
        </div>
        <p className="money mt-1 text-3xl text-slate-900">{p.stale ? "Updating…" : <>{fmtInr(p.rate)} <span className="text-base font-medium text-slate-500">per USDT</span></>}</p>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <label htmlFor="calc-usdt" className="label">You sell</label>
          <div className="relative">
            <input id="calc-usdt" inputMode="decimal" value={usdt} onChange={(e) => setUsdt(e.target.value.trim())} className="input money py-3 pr-16 text-lg" />
            <span className="absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-slate-500">USDT</span>
          </div>
        </div>
        {out && !p.stale && (
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500"><dt>Gross</dt><dd className="tabular-nums">{fmtInr(out.gross)}</dd></div>
            {out.taxHeld.gt(0) && <div className="flex justify-between text-slate-500"><dt>Tax held back ({p.taxPercent}%)</dt><dd className="tabular-nums">− {fmtInr(out.taxHeld)}</dd></div>}
            {out.fee.gt(0) && <div className="flex justify-between text-slate-500"><dt>{feeLabel("Platform fee", { ...out, feePercent: p.feePercent })}</dt><dd className="tabular-nums">− {fmtInr(out.fee)}</dd></div>}
            {out.gstOnFee.gt(0) && <div className="flex justify-between text-slate-500"><dt>GST on fee ({p.gstPercent}%)</dt><dd className="tabular-nums">− {fmtInr(out.gstOnFee)}</dd></div>}
            <div className="flex items-baseline justify-between border-t border-slate-100 pt-3">
              <dt className="font-semibold text-slate-900">You receive</dt>
              <dd className="money text-2xl text-emerald-700">{fmtInr(out.net)}</dd>
            </div>
          </dl>
        )}
        <Link href="/signup" className="btn btn-lg bg-brand-gradient w-full text-white shadow-md hover:opacity-95">
          Get started <ArrowRight className="size-4" aria-hidden />
        </Link>
        <p className="text-center text-xs text-slate-500">Estimate. Your exact amount is locked for 15 minutes when you place an order.</p>
      </div>
    </div>
  );
}
