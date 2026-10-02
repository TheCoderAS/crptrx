"use client";
import { useState } from "react";

/** Colour picker with the hex code next to it; both stay in sync. The text box carries the form value. */
export function ColorField({ name, label, value, hint }: { name: string; label?: string; value: string; hint?: string }) {
  const [v, setV] = useState(value);
  const valid = /^#[0-9a-fA-F]{6}$/.test(v);
  return (
    <div>
      {label && <label className="label" htmlFor={name}>{label}</label>}
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label ?? "Colour"} picker`}
          value={valid ? v : "#000000"}
          onChange={(e) => {
            setV(e.target.value);
            // Let the surrounding settings form notice the change.
            e.currentTarget.form?.dispatchEvent(new Event("input", { bubbles: true }));
          }}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-[var(--surface,#fff)] p-0.5"
        />
        <input id={name} name={name} value={v} onChange={(e) => setV(e.target.value.trim())} maxLength={7} className="input py-2 font-mono text-sm uppercase" spellCheck={false} />
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
