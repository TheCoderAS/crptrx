"use client";
import { useState } from "react";

/** Colour picker with the hex code next to it; both stay in sync. */
export function ColorField({ name, label, value, hint }: { name: string; label: string; value: string; hint?: string }) {
  const [v, setV] = useState(value);
  const valid = /^#[0-9a-fA-F]{6}$/.test(v);
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} value={valid ? v : "#000000"} onChange={(e) => setV(e.target.value)} className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-slate-300 bg-white p-1" />
        <input id={name} name={name} value={v} onChange={(e) => setV(e.target.value.trim())} maxLength={7} className="input font-mono uppercase" spellCheck={false} />
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
