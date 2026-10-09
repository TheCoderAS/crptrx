"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info } from "lucide-react";

/**
 * A small (i) that shows extra detail on hover, focus or tap, so screens stay short.
 * The bubble is placed in the page's top layer and kept inside the screen on phones.
 */
/** `tone="warn"`: an amber warning sign instead of the (i), for rules the reader must not miss. */
export function InfoTip({ children, label, className = "", tone = "info" }: { children: ReactNode; label?: string; className?: string; tone?: "info" | "warn" }) {
  const warn = tone === "warn";
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // opened by tap/click: stays until tapped elsewhere
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current || !tip.current) return;
    const b = btn.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const gap = 8;
    const left = Math.min(Math.max(gap, b.left + b.width / 2 - t.width / 2), window.innerWidth - t.width - gap);
    const above = b.top - t.height - gap;
    setPos({ left, top: above > gap ? above : b.bottom + gap });
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && btn.current?.contains(e.target as Node)) return;
      setPinned(false);
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pinned]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label ?? (warn ? "Warning" : "More info")}
        aria-expanded={open}
        onClick={() => {
          setPinned(!pinned);
          setOpen(!pinned);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        className={`inline-grid size-5 shrink-0 place-items-center rounded-full align-middle transition ${warn ? "text-amber-500 hover:text-amber-600" : "text-slate-400 hover:text-slate-700 focus-visible:text-slate-700"} ${className}`}
      >
        {warn ? <AlertTriangle className="size-4" aria-hidden /> : <Info className="size-3.5" aria-hidden />}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tip}
            role="tooltip"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
            className="theme-lock pointer-events-none fixed z-[60] w-max max-w-[min(18rem,calc(100vw-16px))] rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed font-normal text-white shadow-lg ring-1 ring-white/15"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
