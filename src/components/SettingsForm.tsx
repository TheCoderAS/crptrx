"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useStepUp } from "./StepUp";

/**
 * One form per settings tab. Nothing to click until something changes; then a
 * save bar slides up at the bottom with Discard and Save.
 */
export function SettingsForm({ children, action = "/api/admin/settings" }: { children: ReactNode; action?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stepUp = useStepUp();

  const body = (totp?: string) => {
    const form = ref.current!;
    const obj: Record<string, unknown> = {};
    for (const [k, v] of new FormData(form).entries()) obj[k] = v;
    for (const el of Array.from(form.elements))
      if (el instanceof HTMLInputElement && el.type === "checkbox" && el.name) obj[el.name] = el.checked;
    if (totp) obj.totp = totp;
    return JSON.stringify(obj);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const send = (totp?: string) => fetch(action, { method: "POST", headers: { "content-type": "application/json" }, body: body(totp) });
      let res = await send();
      let data = await res.json().catch(() => ({}));
      let prompted = false;
      while (res.status === 401 && (data.code === "STEP_UP_REQUIRED" || (prompted && data.code === "BAD_2FA"))) {
        prompted = true;
        const code = await stepUp.ask(data.code === "BAD_2FA" ? data.error : undefined);
        if (!code) return;
        res = await send(code);
        data = await res.json().catch(() => ({}));
      }
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? `Couldn't save (${res.status}).` });
        return;
      }
      setDirty(false);
      setMsg({ ok: true, text: data.message ?? "Saved." });
      router.refresh();
      setTimeout(() => setMsg((m) => (m?.ok ? null : m)), 4000);
    } catch {
      setMsg({ ok: false, text: "Network problem. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={ref} onSubmit={save} onInput={() => setDirty(true)} onChange={() => setDirty(true)} className="space-y-4 pb-20">
      <fieldset disabled={busy} className="space-y-4">{children}</fieldset>
      {stepUp.prompt}
      {(dirty || msg) && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:left-56">
          <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl bg-slate-900 py-2.5 pr-2.5 pl-4 text-sm text-white shadow-[var(--shadow-float)] theme-lock" role="status">
            {msg ? (
              <span className={`flex flex-1 items-center gap-2 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
                {msg.ok ? <CheckCircle2 className="size-4 shrink-0" aria-hidden /> : <AlertCircle className="size-4 shrink-0" aria-hidden />}
                {msg.text}
              </span>
            ) : (
              <span className="flex-1 text-slate-300">Unsaved changes</span>
            )}
            {dirty && (
              <>
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 font-medium text-slate-300 hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    ref.current?.reset();
                    setDirty(false);
                    setMsg(null);
                  }}
                >
                  Discard
                </button>
                <button type="submit" disabled={busy} className="rounded-lg bg-white px-4 py-1.5 font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60">
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
