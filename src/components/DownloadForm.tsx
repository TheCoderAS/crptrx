"use client";
import { useState, type ReactNode } from "react";

/** Posts a form and saves the response as a file (for CSV exports that need a 2FA code). */
export function DownloadForm({ action, children, className }: { action: string; children: ReactNode; className?: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const res = await fetch(action, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(fd.entries())) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Export failed");
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
    <form onSubmit={submit} className={className}>
      <fieldset disabled={busy} className="contents">{children}</fieldset>
      {err && <p role="alert" className="mt-2 rounded bg-red-50 p-2 text-sm text-red-800">{err}</p>}
    </form>
  );
}
