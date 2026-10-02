"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useConfirm } from "./Confirm";
import { useStepUp } from "./StepUp";

/**
 * Posts the form to an API route (multipart when it has files, else JSON).
 * On success: follows `redirect` from the response, or refreshes the page.
 */
export function ApiForm({
  action,
  method = "POST",
  children,
  className,
  confirm,
  successMessage,
  onSuccess,
  resetOnSuccess,
  outerClassName,
}: {
  action: string;
  method?: string;
  children: ReactNode;
  className?: string;
  confirm?: string;
  successMessage?: string;
  onSuccess?: (data: Record<string, unknown>) => void;
  resetOnSuccess?: boolean;
  /** Classes for the <form> itself (e.g. flex-1 inside a row). */
  outerClassName?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stepUp = useStepUp();
  const confirmer = useConfirm();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; // read before any await: React clears currentTarget afterwards
    if (confirm && !(await confirmer.ask(confirm))) return;
    setBusy(true);
    setError(null);
    setOk(null);
    const build = (totp?: string): RequestInit => {
      const fd = new FormData(form);
      if (totp) fd.set("totp", totp);
      const hasFile = [...fd.values()].some((v) => v instanceof File);
      if (hasFile) return { method, body: fd };
      const obj: Record<string, unknown> = {};
      for (const [k, v] of fd.entries()) {
        const el = form.elements.namedItem(k);
        if (el instanceof HTMLInputElement && el.type === "checkbox") obj[k] = true;
        else obj[k] = v;
      }
      for (const el of Array.from(form.elements)) if (el instanceof HTMLInputElement && el.type === "checkbox" && !(el.name in obj)) obj[el.name] = false;
      return { method, body: JSON.stringify(obj), headers: { "content-type": "application/json" } };
    };
    try {
      let res = await fetch(action, build());
      let data = await res.json().catch(() => ({}));
      // Sensitive admin action without a recent 2FA code: ask once, then retry.
      // (A wrong code from the dialog re-opens it; a wrong code typed on the 2FA login page doesn't.)
      let prompted = false;
      while (res.status === 401 && (data.code === "STEP_UP_REQUIRED" || (prompted && data.code === "BAD_2FA"))) {
        prompted = true;
        const code = await stepUp.ask(data.code === "BAD_2FA" ? data.error : undefined);
        if (!code) return;
        res = await fetch(action, build(code));
        data = await res.json().catch(() => ({}));
      }
      if (!res.ok) {
        setError(data.error ?? `Something went wrong (${res.status}).`);
        return;
      }
      if (resetOnSuccess) form.reset();
      onSuccess?.(data);
      // Refresh after navigating too, so shared layout (header, tab bar) reflects a login or logout.
      if (data.redirect) router.push(data.redirect);
      router.refresh();
      if (successMessage || data.message) setOk(data.message ?? successMessage);
    } catch {
      setError("Network problem. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-busy={busy} className={outerClassName}>
      {/* The fieldset carries the layout classes so spacing and grids apply to the fields
          (a display:contents wrapper would silently break space-y-*). */}
      <fieldset disabled={busy} className={className}>
        {children}
        {error && (
          <p role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200 ring-inset">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        )}
        {ok && (
          <p role="status" className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200 ring-inset">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{ok}</span>
          </p>
        )}
      </fieldset>
      {stepUp.prompt}
      {confirmer.prompt}
    </form>
  );
}
