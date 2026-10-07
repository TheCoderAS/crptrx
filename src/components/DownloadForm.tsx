"use client";
import { toastError } from "@/components/Toaster";
import { useState, type ReactNode } from "react";
import { useStepUp } from "./StepUp";

/** Posts a form and saves the response as a file (CSV exports; asks for a 2FA code if one is needed). */
export function DownloadForm({ action, children, className }: { action: string; children: ReactNode; className?: string }) {
  // Messages go to the top-right pop-ups (Toaster).
  const setErr = (m: string | null) => void (m && toastError(m));
  const [busy, setBusy] = useState(false);
  const stepUp = useStepUp();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const fields = Object.fromEntries(new FormData(e.currentTarget).entries());
      const send = (totp?: string) => fetch(action, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...fields, ...(totp ? { totp } : {}) }) });
      let res = await send();
      let prompted = false;
      while (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status !== 401 || !(data.code === "STEP_UP_REQUIRED" || (prompted && data.code === "BAD_2FA"))) throw new Error(data.error ?? "Export failed");
        prompted = true;
        const code = await stepUp.ask(data.code === "BAD_2FA" ? data.error : undefined);
        if (!code) return;
        res = await send(code);
      }
      const name = res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ?? "export.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} aria-busy={busy}>
      {/* Layout classes go on the fieldset: a display:contents wrapper breaks space-y-* spacing. */}
      <fieldset disabled={busy} className={className}>
        {children}
      </fieldset>
      {stepUp.prompt}
    </form>
  );
}
