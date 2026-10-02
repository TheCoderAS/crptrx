"use client";
import { useCallback, useState } from "react";
import { Landmark, Plus, Smartphone } from "lucide-react";
import { ApiForm } from "./ApiForm";
import { Modal } from "./Modal";

/** "Add bank or UPI" button that opens the form in a dialog. */
export function AddPayoutMethod({ kycRequired = true, autoOpen = false, className = "btn-primary" }: { kycRequired?: boolean; autoOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(autoOpen);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Add bank or UPI
      </button>
      <Modal open={open} onClose={close} title="Add bank or UPI" description={kycRequired ? "It must be in the same name as your PAN." : "It must be in your own name."}>
        <PayoutMethodForm onSaved={close} />
      </Modal>
    </>
  );
}

function PayoutMethodForm({ onSaved }: { onSaved: () => void }) {
  const [type, setType] = useState<"BANK" | "UPI">("BANK");
  return (
    <ApiForm action="/api/payout-methods" className="space-y-5" onSuccess={onSaved}>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/60 p-1 ring-1 ring-slate-200 ring-inset" role="radiogroup" aria-label="Payout type">
        {([["BANK", "Bank account", Landmark], ["UPI", "UPI ID", Smartphone]] as const).map(([t, label, Icon]) => (
          <label key={t} className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition focus-within:outline-2 focus-within:outline-brand-600 ${type === t ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-300" : "text-slate-500 hover:text-slate-800"}`}>
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
