"use client";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Landmark, Lock } from "lucide-react";
import { ApiForm } from "./ApiForm";
import { NETWORK_CODES, NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { calculatePayout, fmtInr, usdtForNetRupees } from "@/server/money";
import { NetworkMark } from "./ui";

interface Props {
  rate: string;
  taxPercent: string;
  feePercent: string;
  gstEnabled: boolean;
  gstPercent: string;
  min: string;
  max: string;
  available: Record<NetworkCode, boolean>;
  methods: { id: string; label: string; isDefault: boolean }[];
}

function StepTitle({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className={`grid size-8 place-items-center rounded-xl text-sm font-bold text-white shadow-sm ${done ? "tile-emerald" : "bg-brand-gradient"}`}>{done ? <Check className="size-4" aria-hidden /> : n}</span>
      <h2 className="h2">{title}</h2>
    </div>
  );
}

export function SellForm(p: Props) {
  const [network, setNetwork] = useState<NetworkCode | null>(null);
  const [amountType, setAmountType] = useState<"USDT" | "INR">("USDT");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(p.methods.find((m) => m.isDefault)?.id ?? p.methods[0]?.id);
  const cfg = { rate: p.rate, taxPercent: p.taxPercent, feePercent: p.feePercent, gstEnabled: p.gstEnabled, gstPercent: p.gstPercent };
  const estimate = useMemo(() => {
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return null;
    try {
      const usdt = amountType === "USDT" ? amount : usdtForNetRupees(amount, cfg).toString();
      return { usdt, ...calculatePayout({ usdt, ...cfg }) };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, amountType]);
  const outOfRange = estimate && (Number(estimate.usdt) < Number(p.min) || Number(estimate.usdt) > Number(p.max));

  return (
    <ApiForm action="/api/quotes" className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="space-y-6">
        <section className="card">
          <StepTitle n={1} title="Which network will you send on?" done={!!network} />
          <div className="grid gap-3 sm:grid-cols-2">
            {NETWORK_CODES.map((n) => {
              const on = p.available[n];
              const picked = network === n;
              return (
                <label
                  key={n}
                  className={`relative flex cursor-pointer gap-3 rounded-xl p-4 ring-1 transition ${picked ? "bg-brand-50/60 ring-2 ring-brand-600" : "ring-slate-200 hover:ring-slate-300"} ${!on ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <input type="radio" name="network" value={n} required disabled={!on} checked={picked} onChange={() => setNetwork(n)} className="sr-only" />
                  <NetworkMark network={n} size={36} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">{NETWORK_INFO[n].name}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{on ? NETWORK_INFO[n].hint : "Paused right now. Please use the other network."}</span>
                  </span>
                  {picked && <Check className="absolute top-3 right-3 size-4 text-brand-600" aria-hidden />}
                </label>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">Choose the same network when you withdraw from your wallet or exchange. Sending on a different network may lose your funds.</p>
        </section>

        <section className="card">
          <StepTitle n={2} title="How much?" done={!!estimate && !outOfRange} />
          <div className="mb-3 inline-grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(["USDT", "INR"] as const).map((t) => (
              <label key={t} className={`cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium transition ${amountType === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                <input type="radio" name="amountType" value={t} checked={amountType === t} onChange={() => setAmountType(t)} className="sr-only" />
                {t === "USDT" ? "USDT to sell" : "₹ to receive"}
              </label>
            ))}
          </div>
          <div className="relative">
            <input
              name="amount"
              required
              inputMode="decimal"
              autoComplete="off"
              className="input money py-3.5 pr-20 text-2xl"
              placeholder={amountType === "USDT" ? "100" : "9,000"}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/,/g, "").trim())}
              aria-describedby="amount-hint"
            />
            <span className="absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-slate-500">{amountType === "USDT" ? "USDT" : "INR"}</span>
          </div>
          <p id="amount-hint" className={`hint ${outOfRange ? "text-rose-600" : ""}`}>
            Per order: {p.min}–{p.max} USDT · Rate {fmtInr(p.rate)} per USDT
          </p>
        </section>

        <section className="card">
          <StepTitle n={3} title="Where should we pay you?" done={!!method} />
          <input type="hidden" name="payoutMethodId" value={method} />
          <div className="space-y-2">
            {p.methods.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => setMethod(m.id)}
                aria-pressed={method === m.id}
                className={`flex w-full items-center gap-3 rounded-xl p-3.5 text-left ring-1 transition ${method === m.id ? "bg-brand-50/60 ring-2 ring-brand-600" : "ring-slate-200 hover:ring-slate-300"}`}
              >
                <Landmark className="size-5 text-slate-500" aria-hidden />
                <span className="flex-1 text-sm font-medium text-slate-900">{m.label}</span>
                {method === m.id && <Check className="size-4 text-brand-600" aria-hidden />}
              </button>
            ))}
          </div>
        </section>
      </div>

      <aside className="ring-gradient rounded-3xl p-5 shadow-[var(--shadow-raised)] sm:p-6 lg:sticky lg:top-24">
        <p className="eyebrow">Summary</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Network</dt><dd className="font-medium">{network ? NETWORK_INFO[network].name : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">You sell</dt><dd className="money">{estimate ? `≈ ${estimate.usdt} USDT` : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Gross</dt><dd className="tabular-nums">{estimate ? fmtInr(estimate.gross) : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Tax held back ({p.taxPercent}%)</dt><dd className="tabular-nums">{estimate ? `− ${fmtInr(estimate.taxHeld)}` : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Fee{p.gstEnabled ? " + GST" : ""}</dt><dd className="tabular-nums">{estimate ? `− ${fmtInr(estimate.fee.plus(estimate.gstOnFee))}` : "—"}</dd></div>
        </dl>
        <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
          <span className="font-semibold text-slate-900">You receive</span>
          <span className="money text-2xl text-emerald-700">{estimate ? `≈ ${fmtInr(estimate.net)}` : "—"}</span>
        </div>
        <button className="btn btn-lg bg-brand-gradient mt-5 w-full text-white shadow-lg shadow-brand-600/20 hover:opacity-95" disabled={!network || !estimate || !!outOfRange}>
          Get my quote <ArrowRight className="size-4" aria-hidden />
        </button>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Next you&apos;ll see the exact amount, locked for 15 minutes. Nothing is charged until you send USDT.
        </p>
      </aside>
    </ApiForm>
  );
}
