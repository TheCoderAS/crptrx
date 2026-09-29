"use client";
import { useState } from "react";
import { LifeBuoy } from "lucide-react";
import { ApiForm } from "./ApiForm";

/** Collapsible "contact support" box. Keeps its own open state so a page refresh after sending doesn't close it. */
export function SupportPanel({ orderId, defaultOpen, hours }: { orderId: string; defaultOpen: boolean; hours: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="card group" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span className="icon-tile tile-violet size-9 rounded-xl"><LifeBuoy className="size-4" aria-hidden /></span>
        <span className="flex-1">
          <span className="block font-semibold text-slate-900">Contact support about this order</span>
          <span className="block text-xs text-slate-500">We reply by email. {hours}.</span>
        </span>
      </summary>
      <ApiForm action="/api/support" className="mt-4 space-y-3" resetOnSuccess>
        <input type="hidden" name="orderId" value={orderId} />
        <textarea name="message" required rows={4} aria-label="Your message to support" className="input" placeholder="Tell us what happened" />
        <div>
          <label className="label" htmlFor="screenshot">Screenshot <span className="font-normal text-slate-500">(optional)</span></label>
          <input id="screenshot" name="screenshot" type="file" accept="image/jpeg,image/png,application/pdf" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" />
        </div>
        <button className="btn-secondary">Send message</button>
      </ApiForm>
    </details>
  );
}
