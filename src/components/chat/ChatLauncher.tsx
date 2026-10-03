"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { InfoTip } from "../InfoTip";
import { ChatPanel } from "./ChatPanel";

/**
 * Chat bubble in the corner of a customer's order page. Opens a support chat
 * pop-up (full screen on phones). The chat stays connected while closed so a
 * reply lights up the bubble.
 */
export function ChatLauncher({ orderId, hours, startUnread = false }: { orderId: string; hours: string; startUnread?: boolean }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [seen, setSeen] = useState(false);
  const dot = unread > 0 || (startUnread && !seen);

  useEffect(() => {
    if (!open) return;
    setSeen(true);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    // Phones: the chat covers the page, so the page behind shouldn't scroll.
    const phone = window.matchMedia("(max-width: 639px)").matches;
    if (phone) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      if (phone) document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support chat" : "Chat with support"}
        aria-expanded={open}
        className={`fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 grid size-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700 md:right-6 md:bottom-6 ${open ? "max-sm:hidden" : ""}`}
      >
        {open ? <X className="size-6" aria-hidden /> : <MessageCircle className="size-6" aria-hidden />}
        {dot && !open && <span className="absolute top-0.5 right-0.5 size-3.5 rounded-full bg-rose-500 ring-2 ring-white" aria-label="New reply" />}
      </button>

      <div
        role="dialog"
        aria-label="Support chat"
        aria-hidden={!open}
        className={`fixed z-50 flex flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-slate-200 transition max-sm:inset-0 sm:right-6 sm:bottom-24 sm:h-[min(620px,calc(100dvh-8rem))] sm:w-[380px] sm:rounded-2xl ${open ? "" : "pointer-events-none invisible translate-y-3 opacity-0"}`}
      >
        <ChatPanel
          orderId={orderId}
          side="USER"
          visible={open}
          onUnread={setUnread}
          header={({ live }) => (
            <div className="flex items-center gap-3 border-b border-slate-200 bg-brand-600 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
              <span className="grid size-9 place-items-center rounded-full bg-white/15"><MessageCircle className="size-4" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 font-semibold">
                  Support <InfoTip className="text-white/80">{hours}. Messages outside these hours are answered next working day.</InfoTip>
                </p>
                <p className="flex items-center gap-1.5 text-xs text-white/80">
                  {live && <span className="size-1.5 rounded-full bg-emerald-300" aria-hidden />}
                  Order {orderId}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close support chat" className="grid size-9 place-items-center rounded-full hover:bg-white/15">
                <X className="size-5" aria-hidden />
              </button>
            </div>
          )}
          empty={<>Questions about this order or payment?<br />Send us a message.</>}
        />
      </div>
    </>
  );
}
