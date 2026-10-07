"use client";
import { toastError } from "@/components/Toaster";

import { useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { ChatPopup } from "./ChatPopup";

/** Support's chat with the customer, as a pop-up on the admin order page. */
export function AdminOrderChat({ orderId, customer, startUnread = false }: { orderId: string; customer: string; startUnread?: boolean }) {
  const [busy, setBusy] = useState(false);
  // Messages go to the top-right pop-ups (Toaster).
  const setError = (m: string | null) => void (m && toastError(m));

  async function setResolved(resolved: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${orderId}/chat/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resolved }) });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't update. Try again.");
    setBusy(false);
  }

  return (
    <ChatPopup
      orderId={orderId}
      side="ADMIN"
      startUnread={startUnread}
      title={customer}
      subtitle={`Order ${orderId}`}
      empty="No messages on this order yet."
      actions={({ status, count }) =>
        count === 0 ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void setResolved(status === "OPEN")}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/25 disabled:opacity-60"
          >
            {status === "OPEN" ? <><CheckCircle2 className="size-3.5" aria-hidden /> Resolve</> : <><RotateCcw className="size-3.5" aria-hidden /> Reopen</>}
          </button>
        )
      }
    />
  );
}
