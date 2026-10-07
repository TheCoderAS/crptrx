"use client";
import { readFully } from "@/lib/shrinkImage";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useConfirm } from "./Confirm";
import { useStepUp } from "./StepUp";
import { toastError, toastOk } from "./Toaster";

/**
 * Lets a field inside the form (a picked file still being read or shrunk) hold the
 * form: while any field is preparing, the action buttons show a spinner and are disabled.
 * Call it when work starts; call the returned function when it ends.
 */
const PrepareContext = createContext<() => () => void>(() => () => undefined);
export const useFormPreparing = () => useContext(PrepareContext);

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
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(0);
  const startPreparing = useCallback(() => {
    setPreparing((n) => n + 1);
    let done = false;
    return () => {
      if (!done) setPreparing((n) => n - 1);
      done = true;
    };
  }, []);
  const stepUp = useStepUp();
  const confirmer = useConfirm();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; // read before any await: React clears currentTarget afterwards
    if (preparing > 0) return; // a file is still being prepared; the buttons are disabled meanwhile
    if (confirm && !(await confirmer.ask(confirm))) return;
    // Read the fields now: once busy, the fieldset is disabled and a disabled field is
    // left out of FormData, so a retry after the 2FA prompt would send nothing else.
    const fields = [...new FormData(form).entries()];
    setBusy(true);
    // Files go up from memory, fully read (see readFully): a phone can otherwise send one cut short.
    for (let i = 0; i < fields.length; i++) {
      const v = fields[i][1];
      if (v instanceof File && v.size > 0) {
        const whole = await readFully(v);
        if (!whole) {
          setBusy(false);
          return toastError("Your phone couldn't hand over a file. Wait a moment and pick it again.");
        }
        fields[i] = [fields[i][0], whole];
      }
    }
    const build = (totp?: string): RequestInit => {
      const fd = new FormData();
      for (const [k, v] of fields) fd.append(k, v);
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
      // The server got an incomplete upload (flaky mobile connection): quietly try up to twice more.
      for (let retry = 1; retry <= 2 && data.code === "UPLOAD_UNREADABLE"; retry++) {
        await new Promise((r) => setTimeout(r, 700 * retry));
        res = await fetch(action, build());
        data = await res.json().catch(() => ({}));
      }
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
        toastError(data.error ?? `Something went wrong (${res.status}).`);
        return;
      }
      if (resetOnSuccess) form.reset();
      onSuccess?.(data);
      // Refresh after navigating too, so shared layout (header, tab bar) reflects a login or logout.
      if (data.redirect) router.push(data.redirect);
      router.refresh();
      if (successMessage || data.message) toastOk(String(data.message ?? successMessage));
    } catch {
      toastError("Network problem. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PrepareContext.Provider value={startPreparing}>
      <form onSubmit={submit} aria-busy={busy || preparing > 0} className={outerClassName}>
        {/* The fieldset carries the layout classes so spacing and grids apply to the fields
            (a display:contents wrapper would silently break space-y-*). */}
        <fieldset disabled={busy || preparing > 0} className={className}>
          {children}
        </fieldset>
        {stepUp.prompt}
        {confirmer.prompt}
      </form>
    </PrepareContext.Provider>
  );
}
