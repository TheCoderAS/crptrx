"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";

/**
 * The one place messages appear: a stack at the top right (top on phones). Errors,
 * warnings, "saved" and page notices all come here instead of boxes inside the page.
 * Each closes by itself after 5 seconds (paused while the pointer is on it) or with ×.
 */
export type Tone = "info" | "warn" | "danger" | "ok";
export type ToastInput = {
  tone?: Tone;
  title?: ReactNode;
  message?: ReactNode;
  /** Same id = same message: shown once at a time, and replaced instead of stacked. */
  id?: string;
  /** Show at most once per browser session (e.g. "Test mode"). Needs an id. */
  once?: boolean;
};
type Toast = ToastInput & { key: number; tone: Tone };

const SHOW_MS = 5000;
const MAX = 4;
let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(t: ToastInput) {
  if (typeof window === "undefined") return;
  if (t.once && t.id) {
    try {
      const k = `toast-seen:${t.id}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {
      /* no storage: show it */
    }
  }
  const next: Toast = { tone: "info", ...t, key: ++seq };
  const rest = t.id ? toasts.filter((x) => x.id !== t.id) : toasts;
  toasts = [...rest, next].slice(-MAX);
  emit();
}

export const toastError = (message: ReactNode, title?: ReactNode) => toast({ tone: "danger", message, title });
export const toastOk = (message: ReactNode) => toast({ tone: "ok", message });

function dismiss(key: number) {
  toasts = toasts.filter((x) => x.key !== key);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const snapshot = () => toasts;
const empty: Toast[] = [];

const STYLE: Record<Tone, [string, typeof Info, string]> = {
  info: ["ring-brand-200", Info, "text-brand-600"],
  warn: ["ring-amber-200", AlertTriangle, "text-amber-600"],
  danger: ["ring-rose-200", ShieldAlert, "text-rose-600"],
  ok: ["ring-emerald-200", CheckCircle2, "text-emerald-600"],
};

function Item({ t }: { t: Toast }) {
  const [hover, setHover] = useState(false);
  const left = useRef(SHOW_MS);
  useEffect(() => {
    if (hover) return;
    const start = Date.now();
    const timer = setTimeout(() => dismiss(t.key), left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - start;
    };
  }, [hover, t.key]);
  const [ring, Icon, color] = STYLE[t.tone];
  return (
    <div
      role={t.tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className={`toast toast-in pointer-events-auto flex w-full gap-3 rounded-xl bg-white p-3.5 text-sm text-slate-800 shadow-lg ring-1 ${ring}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-hidden />
      <div className="min-w-0 flex-1 leading-relaxed break-words">
        {t.title && <p className="font-semibold text-slate-900">{t.title}</p>}
        {t.message}
      </div>
      <button type="button" onClick={() => dismiss(t.key)} className="-my-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Mounted once in the root layout. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, () => empty);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-96">
      {list.map((t) => <Item key={t.key} t={t} />)}
    </div>
  );
}

/** Server pages: <Notify tone="warn" title="…">text</Notify> shows a message when the page opens. */
export function Notify({ tone = "info", title, children, id, once }: { tone?: Tone; title?: ReactNode; children?: ReactNode; id?: string; once?: boolean }) {
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast({ tone, title, message: children, id, once });
    // Once per mount: refreshes of the same page don't repeat it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
