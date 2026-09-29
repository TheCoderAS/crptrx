"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function WalletRemoveButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="btn-ghost px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
      onClick={async () => {
        if (!window.confirm("Remove this wallet?")) return;
        setBusy(true);
        await fetch(`/api/wallets/${id}`, { method: "DELETE" }).catch(() => undefined);
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Removing…" : "Remove"}
    </button>
  );
}
