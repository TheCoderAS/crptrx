"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "./Confirm";

export function WalletRemoveButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirmer = useConfirm();
  return (
    <span className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        disabled={busy}
        className="btn-ghost min-h-10 px-3 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
        onClick={async () => {
          if (!(await confirmer.ask("Remove this wallet? You can add it again later."))) return;
          setBusy(true);
          setErr(null);
          try {
            const r = await fetch(`/api/wallets/${id}`, { method: "DELETE" });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Couldn't remove it. Please try again.");
            router.refresh();
          } catch (e) {
            setErr((e as Error).message === "Failed to fetch" ? "Network problem. Please try again." : (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Removing…" : "Remove"}
      </button>
      {err && <span role="alert" className="text-xs text-rose-700">{err}</span>}
      {confirmer.prompt}
    </span>
  );
}
