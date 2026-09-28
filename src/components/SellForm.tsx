"use client";
import { useMemo, useState } from "react";
import { ApiForm } from "./ApiForm";
import { NETWORK_CODES, NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { calculatePayout, fmtInr, usdtForNetRupees } from "@/server/money";

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

export function SellForm(p: Props) {
  const [network, setNetwork] = useState<NetworkCode | null>(null);
  const [amountType, setAmountType] = useState<"USDT" | "INR">("USDT");
  const [amount, setAmount] = useState("");
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

  return (
    <ApiForm action="/api/quotes" className="space-y-6">
      <div className="card space-y-3">
        <h2 className="h2">1. Which network will you send on?</h2>
        <p className="muted">Pick the network your wallet or exchange will use. Sending on a different network may lose your funds.</p>
        {NETWORK_CODES.map((n) => (
          <label key={n} className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 ring-1 ${network === n ? "bg-brand-50 ring-2 ring-brand-600" : "ring-gray-300"} ${!p.available[n] ? "opacity-50" : ""}`}>
            <input type="radio" name="network" value={n} required disabled={!p.available[n]} checked={network === n} onChange={() => setNetwork(n)} className="mt-1" />
            <span>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-sm font-semibold ring-1 ${NETWORK_INFO[n].badge}`}>{NETWORK_INFO[n].name}</span>
              <span className="mt-1 block text-sm text-gray-600">{p.available[n] ? NETWORK_INFO[n].hint : "Paused right now. Please use the other network or try later."}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="card space-y-3">
        <h2 className="h2">2. How much?</h2>
        <div className="flex gap-2">
          {(["USDT", "INR"] as const).map((t) => (
            <label key={t} className={`btn flex-1 cursor-pointer ring-1 ${amountType === t ? "bg-brand-50 ring-brand-600" : "ring-gray-300"}`}>
              <input type="radio" name="amountType" value={t} checked={amountType === t} onChange={() => setAmountType(t)} className="sr-only" />
              {t === "USDT" ? "USDT to sell" : "₹ to receive"}
            </label>
          ))}
        </div>
        <input name="amount" required inputMode="decimal" className="input text-lg" placeholder={amountType === "USDT" ? "e.g. 100" : "e.g. 9000"} value={amount} onChange={(e) => setAmount(e.target.value.trim())} />
        <p className="muted">Per order: {p.min} to {p.max} USDT. Rate: {fmtInr(p.rate)} per USDT.</p>
        {estimate && (
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p>About <b>{fmtInr(estimate.net)}</b> for about {estimate.usdt} USDT, after 1% tax held back and fees.</p>
            <p className="muted">Your exact quote (with a few added cents that identify your payment) is on the next screen.</p>
          </div>
        )}
      </div>
      <div className="card space-y-3">
        <h2 className="h2">3. Where should we pay you?</h2>
        <select name="payoutMethodId" className="input" defaultValue={p.methods.find((m) => m.isDefault)?.id ?? p.methods[0]?.id}>
          {p.methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <button className="btn-primary w-full py-3 text-base" disabled={!network}>Get my quote</button>
    </ApiForm>
  );
}
