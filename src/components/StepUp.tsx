"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";

/**
 * Asks an admin for a 2FA code only when the server says one is needed
 * (STEP_UP_REQUIRED). One code covers sensitive actions for 15 minutes.
 */
export function useStepUp() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolver = useRef<((code: string | null) => void) | null>(null);

  const ask = (err?: string) =>
    new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      setError(err ?? null);
      setOpen(true);
    });
  const finish = (code: string | null) => {
    setOpen(false);
    resolver.current?.(code);
    resolver.current = null;
  };
  const prompt = open ? <StepUpDialog error={error} onDone={finish} /> : null;
  return { ask, prompt };
}

function StepUpDialog({ error, onDone }: { error: string | null; onDone: (code: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onDone(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onDone]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="stepup-title">
      {/* A div, not a form: this can open inside another form. */}
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-[var(--shadow-float)]">
        <span className="icon-tile tile-blue"><ShieldCheck className="size-5" aria-hidden /></span>
        <h2 id="stepup-title" className="mt-4 text-lg font-semibold text-slate-900">Confirm it&apos;s you</h2>
        <p className="mt-1 text-sm text-slate-500">Enter the 6-digit code from your authenticator app. You won&apos;t be asked again for 15 minutes.</p>
        <input
          ref={input}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-label="2FA code"
          className="input mt-4 text-center font-mono text-lg tracking-[0.5em]"
          placeholder="123456"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (input.current?.value.trim()) onDone(input.current.value.trim());
            }
          }}
        />
        {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => onDone(null)}>Cancel</button>
          <button type="button" className="btn-primary" onClick={() => input.current?.value.trim() && onDone(input.current.value.trim())}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
