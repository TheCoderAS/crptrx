"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

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
}: {
  action: string;
  method?: string;
  children: ReactNode;
  className?: string;
  confirm?: string;
  successMessage?: string;
  onSuccess?: (data: Record<string, unknown>) => void;
  resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError(null);
    setOk(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const hasFile = [...fd.values()].some((v) => v instanceof File);
    const init: RequestInit = { method };
    if (hasFile) init.body = fd;
    else {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of fd.entries()) {
        const el = form.elements.namedItem(k);
        if (el instanceof HTMLInputElement && el.type === "checkbox") obj[k] = true;
        else obj[k] = v;
      }
      for (const el of Array.from(form.elements)) if (el instanceof HTMLInputElement && el.type === "checkbox" && !(el.name in obj)) obj[el.name] = false;
      init.body = JSON.stringify(obj);
      init.headers = { "content-type": "application/json" };
    }
    try {
      const res = await fetch(action, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Something went wrong (${res.status}).`);
        return;
      }
      if (resetOnSuccess) form.reset();
      onSuccess?.(data);
      if (data.redirect) router.push(data.redirect);
      else router.refresh();
      if (successMessage || data.message) setOk(data.message ?? successMessage);
    } catch {
      setError("Network problem. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={className}>
      <fieldset disabled={busy} className="contents">
        {children}
      </fieldset>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {ok && <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">{ok}</p>}
    </form>
  );
}
