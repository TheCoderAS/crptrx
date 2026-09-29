"use client";
import { useState } from "react";
import { Landmark, Smartphone } from "lucide-react";
import { ApiForm } from "./ApiForm";

export function PayoutMethodForm({ first, kycRequired = true }: { first?: boolean; kycRequired?: boolean }) {
  const [type, setType] = useState<"BANK" | "UPI">("BANK");
  return (
    <ApiForm action="/api/payout-methods" className="card space-y-5" resetOnSuccess>
      <div>
        <h2 className="h2">{first ? "Add where you want to be paid" : "Add another"}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{kycRequired ? "It must be in the same name as your PAN." : "It must be in your own name."}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Payout type">
        {([["BANK", "Bank account", Landmark], ["UPI", "UPI ID", Smartphone]] as const).map(([t, label, Icon]) => (
          <label key={t} className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${type === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
            <Icon className="size-4" aria-hidden /> {label}
          </label>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="holderName">Account holder name</label>
          <input id="holderName" name="holderName" required autoComplete="name" className="input" />
        </div>
        {type === "BANK" ? (
          <>
            <div>
              <label className="label" htmlFor="accountNumber">Account number</label>
              <input id="accountNumber" name="accountNumber" inputMode="numeric" required className="input font-mono" autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="accountNumberConfirm">Re-enter account number</label>
              <input id="accountNumberConfirm" name="accountNumberConfirm" inputMode="numeric" required className="input font-mono" autoComplete="off" onPaste={(e) => e.preventDefault()} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ifsc">IFSC</label>
              <input id="ifsc" name="ifsc" required className="input font-mono uppercase" maxLength={11} placeholder="HDFC0001234" />
              <p className="hint">Printed on your cheque book or passbook.</p>
            </div>
          </>
        ) : (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="upiId">UPI ID</label>
            <input id="upiId" name="upiId" required className="input" placeholder="yourname@okhdfcbank" />
          </div>
        )}
      </div>
      <button className="btn-primary w-full">Save for review</button>
    </ApiForm>
  );
}
