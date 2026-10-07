"use client";
import { InfoTip } from "./InfoTip";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Landmark, Lock } from "lucide-react";
import { ApiForm } from "./ApiForm";
import { NETWORK_CODES, NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { calculatePayout, D, feeLabel, fmtInr, rupees, usdtForNetRupees } from "@/server/money";
import { NetworkMark } from "./ui";

interface Props {
  rate: string;
  taxPercent: string;
  feePercent: string;
  gstEnabled: boolean;
  gstPercent: string;
  feeMin?: string;
  feeMax?: string;
  /** Bonus reward per USDT at today's rate ("0" = none). The quote fixes the exact amount. */
  rewardPerUsdt?: string;
  min: string;
  max: string;
  available: Record<NetworkCode, boolean>;
  methods: { id: string; label: string; isDefault: boolean }[];
}

function StepTitle({ n, title, done, info }: { n: number; title: string; done: boolean; info?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className={`grid size-8 place-items-center rounded-xl text-sm font-bold text-white shadow-sm ${done ? "tile-emerald" : "bg-brand-gradient"}`}>{done ? <Check className="size-4" aria-hidden /> : n}</span>
      <h2 className="h2 flex items-center gap-1">{title}{info && <InfoTip>{info}</InfoTip>}</h2>
    </div>
  );
}

export function SellForm(p: Props) {
  // Paused networks aren't shown at all; with only one left, it's picked for them.
  const networks = NETWORK_CODES.filter((n) => p.available[n]);
  const [network, setNetwork] = useState<NetworkCode | null>(networks.length === 1 ? networks[0] : null);
  const [amountType, setAmountType] = useState<"USDT" | "INR">("USDT");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(p.methods.find((m) => m.isDefault)?.id ?? p.methods[0]?.id);
  const cfg = { rate: p.rate, taxPercent: p.taxPercent, feePercent: p.feePercent, gstEnabled: p.gstEnabled, gstPercent: p.gstPercent, feeMin: p.feeMin, feeMax: p.feeMax };
  const estimate = useMemo(() => {
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return null;
    try {
      const usdt = amountType === "USDT" ? amount : usdtForNetRupees(amount, cfg).toString();
      const pay = calculatePayout({ usdt, ...cfg });
      const bonus = rupees(D(usdt).mul(D(p.rewardPerUsdt ?? 0)));
      return { usdt, ...pay, bonus, net: pay.net.plus(bonus) };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, amountType]);
  const outOfRange = !estimate ? null : Number(estimate.usdt) < Number(p.min) ? `The minimum is ${p.min} USDT.` : Number(estimate.usdt) > Number(p.max) ? `The maximum is ${p.max} USDT.` : null;

  return (
    <ApiForm action="/api/quotes" className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="space-y-6">
        <section className="card">
          <StepTitle n={1} title={networks.length === 1 ? "Send on this network" : "Which network will you send on?"} done={!!network} info="Pick the same network when you withdraw from your wallet or exchange. A different network may lose your funds." />
          {networks.length === 0 && <p className="text-sm text-slate-600">Selling is paused right now. Please check back soon.</p>}
          <div className={`grid gap-3 ${networks.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {networks.map((n) => {
              const picked = network === n;
              return (
                <label
                  key={n}
                  className={`relative flex cursor-pointer gap-3 rounded-xl p-4 ring-1 transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-600 ${picked ? "bg-brand-50/60 ring-2 ring-brand-600" : "ring-slate-200 hover:ring-slate-300"}`}
                >
                  <input type="radio" name="network" value={n} required checked={picked} onChange={() => setNetwork(n)} className="sr-only" />
                  <NetworkMark network={n} size={36} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">{NETWORK_INFO[n].name}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{NETWORK_INFO[n].hint}</span>
                  </span>
                  {picked && <Check className="absolute top-3 right-3 size-4 text-brand-600" aria-hidden />}
                </label>
              );
            })}
          </div>
        </section>

        <section className="card">
          <StepTitle n={2} title="How much?" done={!!estimate && !outOfRange} />
          <div className="mb-3 inline-grid grid-cols-2 gap-1 rounded-xl bg-slate-200/60 p-1 ring-1 ring-slate-200 ring-inset">
            {(["USDT", "INR"] as const).map((t) => (
              <label key={t} className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition focus-within:outline-2 focus-within:outline-brand-600 ${amountType === t ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-300" : "text-slate-500 hover:text-slate-800"}`}>
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
              aria-label={amountType === "USDT" ? "USDT to sell" : "Rupees to receive"}
              aria-describedby="amount-hint"
              aria-invalid={!!outOfRange}
            />
            <span className="absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-slate-500">{amountType === "USDT" ? "USDT" : "INR"}</span>
          </div>
          <p id="amount-hint" className={`hint ${outOfRange ? "font-medium text-rose-600" : ""}`} aria-live="polite">
            {outOfRange ? `${outOfRange} ` : ""}Per order: {p.min}–{p.max} USDT · Rate {fmtInr(p.rate)} per USDT
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
          {/* Lines that come to zero are left out. */}
          {Number(p.taxPercent) > 0 && (
            <div className="flex justify-between"><dt className="text-slate-500">Tax held back ({p.taxPercent}%)</dt><dd className="tabular-nums">{estimate ? `− ${fmtInr(estimate.taxHeld)}` : "—"}</dd></div>
          )}
          {(estimate ? estimate.fee.gt(0) : Number(p.feePercent) > 0 || !!p.feeMin) && (
            <div className="flex justify-between"><dt className="text-slate-500">{estimate ? feeLabel("Platform fee", { ...estimate, feePercent: p.feePercent }) : `Platform fee (${p.feePercent}%)`}</dt><dd className="tabular-nums">{estimate ? `− ${fmtInr(estimate.fee)}` : "—"}</dd></div>
          )}
          {p.gstEnabled && Number(p.gstPercent) > 0 && (estimate ? estimate.fee.gt(0) : Number(p.feePercent) > 0 || !!p.feeMin) && (
            <div className="flex justify-between"><dt className="text-slate-500">GST on fee ({p.gstPercent}%)</dt><dd className="tabular-nums">{estimate ? `− ${fmtInr(estimate.gstOnFee)}` : "—"}</dd></div>
          )}
          {Number(p.rewardPerUsdt ?? 0) > 0 && (
            <div className="flex justify-between"><dt className="text-emerald-700">Bonus reward</dt><dd className="tabular-nums text-emerald-700">{estimate ? `+ ${fmtInr(estimate.bonus)}` : "—"}</dd></div>
          )}
        </dl>
        <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
          <span className="font-semibold text-slate-900">You receive</span>
          <span className="money text-2xl text-emerald-700">{estimate ? `≈ ${fmtInr(estimate.net)}` : "—"}</span>
        </div>
        <button className="btn btn-lg bg-brand-gradient mt-5 hidden w-full text-white shadow-lg shadow-brand-600/20 hover:opacity-95 lg:flex" disabled={!network || !estimate || !!outOfRange}>
          Get my quote <ArrowRight className="size-4" aria-hidden />
        </button>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          Price locked for 15 minutes
          <InfoTip>Next you&apos;ll see the exact amount to send. Nothing is charged until you send USDT.</InfoTip>
        </p>
      </aside>

      {/* Phones: the total and the action stay in view above the tab bar. */}
      <div className="h-16 lg:hidden" aria-hidden />
      <div data-sticky-bar className="fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom))] z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(15_23_42/0.15)] backdrop-blur md:bottom-0 lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">You receive</p>
            <p className="money truncate text-lg text-emerald-700">{estimate ? `≈ ${fmtInr(estimate.net)}` : "—"}</p>
          </div>
          <button className="btn bg-brand-gradient px-5 py-3 text-white shadow-md hover:opacity-95" disabled={!network || !estimate || !!outOfRange}>
            Get my quote <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </ApiForm>
  );
}
