"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MessageCircle, X } from "lucide-react";
import { ChatPanel } from "./ChatPanel";

/**
 * Chat bubble in the corner that opens an order's chat in a pop-up (full screen
 * on phones), like a website support widget. Used by customers and by support.
 * The chat stays connected while closed so a new message lights up the bubble.
 */
export function ChatPopup({
  orderId,
  side,
  title,
  subtitle,
  info,
  actions,
  startUnread = false,
  empty,
  aboveTabBar = false,
}: {
  orderId: string;
  side: "USER" | "ADMIN";
  title: ReactNode;
  subtitle: ReactNode;
  info?: ReactNode;
  /** Extra header buttons, given the chat's state (e.g. Resolve). */
  actions?: (s: { status: "OPEN" | "RESOLVED"; count: number }) => ReactNode;
  startUnread?: boolean;
  empty?: ReactNode;
  /** Customer pages have a tab bar at the bottom on phones. */
  aboveTabBar?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [seen, setSeen] = useState(false);
  const dot = unread > 0 || (startUnread && !seen);
  const label = side === "USER" ? "Chat with support" : "Chat with customer";

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
        aria-label={open ? `Close ${label.toLowerCase()}` : label}
        aria-expanded={open}
        className={`fixed right-4 z-40 grid size-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700 md:right-6 md:bottom-6 ${aboveTabBar ? "bottom-[calc(5rem+env(safe-area-inset-bottom))]" : "bottom-[calc(1rem+env(safe-area-inset-bottom))]"} ${open ? "max-sm:hidden" : ""}`}
      >
        {open ? <X className="size-6" aria-hidden /> : <MessageCircle className="size-6" aria-hidden />}
        {dot && !open && (
          <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold ring-2 ring-white" aria-label="New message">
            {unread > 0 ? unread : ""}
          </span>
        )}
      </button>

      <div
        role="dialog"
        aria-label={label}
        aria-hidden={!open}
        className={`fixed z-50 flex flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-slate-200 transition max-sm:inset-0 sm:right-6 sm:bottom-24 sm:h-[min(620px,calc(100dvh-8rem))] sm:w-[380px] sm:rounded-2xl ${open ? "" : "pointer-events-none invisible translate-y-3 opacity-0"}`}
      >
        <ChatPanel
          orderId={orderId}
          side={side}
          visible={open}
          onUnread={setUnread}
          header={({ live, status, count }) => (
            <div className="flex items-center gap-3 border-b border-slate-200 bg-brand-600 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15"><MessageCircle className="size-4" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate font-semibold">{title}{info}</p>
                <p className="flex items-center gap-1.5 truncate text-xs text-white/80">
                  {live && <span className="size-1.5 shrink-0 rounded-full bg-emerald-300" aria-hidden />}
                  {subtitle}
                </p>
              </div>
              {actions?.({ status, count })}
              <button type="button" onClick={() => setOpen(false)} aria-label={`Close ${label.toLowerCase()}`} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-white/15">
                <X className="size-5" aria-hidden />
              </button>
            </div>
          )}
          empty={empty}
        />
      </div>
    </>
  );
}
