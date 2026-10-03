"use client";

import { useState } from "react";
import { CheckCircle2, MessageCircle, RotateCcw } from "lucide-react";
import { ChatPanel } from "./ChatPanel";

/** Support chat with the customer, on the admin order page. */
export function AdminOrderChat({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setResolved(resolved: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${orderId}/chat/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resolved }) });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't update. Try again.");
    setBusy(false);
  }

  return (
    <section className="card h-[min(560px,75vh)] overflow-hidden p-0" aria-label="Chat with customer">
      <ChatPanel
        orderId={orderId}
        side="ADMIN"
        visible
        empty="No messages on this order."
        header={({ live, status, count }) => (
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="size-4 text-slate-500" aria-hidden />
              <h2 className="h2 flex-1">Chat with customer</h2>
              <span className={`size-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`} title={live ? "Live" : "Connecting…"} aria-label={live ? "Live" : "Connecting"} />
              {count === 0 ? null : status === "OPEN" ? (
                <button type="button" disabled={busy} onClick={() => void setResolved(true)} className="btn-ghost min-h-8 px-2.5 text-xs">
                  <CheckCircle2 className="size-3.5" aria-hidden /> Resolve
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => void setResolved(false)} className="btn-ghost min-h-8 px-2.5 text-xs">
                  <RotateCcw className="size-3.5" aria-hidden /> Reopen
                </button>
              )}
            </div>
            {error && <p role="alert" className="mt-1 text-xs text-rose-700">{error}</p>}
          </div>
        )}
      />
    </section>
  );
}
