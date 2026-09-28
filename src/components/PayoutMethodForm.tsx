"use client";
import { useState } from "react";
import { ApiForm } from "./ApiForm";

export function PayoutMethodForm() {
  const [type, setType] = useState<"BANK" | "UPI">("BANK");
  return (
    <ApiForm action="/api/payout-methods" className="card space-y-4" resetOnSuccess>
      <h2 className="h2">Add a payout method</h2>
      <div className="flex gap-2">
        {(["BANK", "UPI"] as const).map((t) => (
          <label key={t} className={`btn flex-1 cursor-pointer ring-1 ${type === t ? "bg-brand-50 ring-brand-600" : "ring-gray-300"}`}>
            <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
            {t === "BANK" ? "Bank account" : "UPI ID"}
          </label>
        ))}
      </div>
      <div>
        <label className="label" htmlFor="holderName">Account holder name</label>
        <input id="holderName" name="holderName" required className="input" />
      </div>
      {type === "BANK" ? (
        <>
          <div>
            <label className="label" htmlFor="accountNumber">Account number</label>
            <input id="accountNumber" name="accountNumber" inputMode="numeric" required className="input" autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="accountNumberConfirm">Account number again</label>
            <input id="accountNumberConfirm" name="accountNumberConfirm" inputMode="numeric" required className="input" autoComplete="off" onPaste={(e) => e.preventDefault()} />
          </div>
          <div>
            <label className="label" htmlFor="ifsc">IFSC</label>
            <input id="ifsc" name="ifsc" required className="input uppercase" maxLength={11} placeholder="HDFC0001234" />
          </div>
        </>
      ) : (
        <div>
          <label className="label" htmlFor="upiId">UPI ID</label>
          <input id="upiId" name="upiId" required className="input" placeholder="name@okhdfcbank" />
        </div>
      )}
      <button className="btn-primary w-full">Save for review</button>
    </ApiForm>
  );
}
