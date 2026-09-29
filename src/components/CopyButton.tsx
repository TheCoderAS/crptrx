"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`${label}: ${text}`}
      className={`btn shrink-0 px-3 py-2 ring-1 ring-inset ${done ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* clipboard blocked: the value is still visible to copy by hand */
        }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {done ? "Copied" : label}
    </button>
  );
}
