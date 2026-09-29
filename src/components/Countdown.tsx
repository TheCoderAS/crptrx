"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TOTAL_MS = 15 * 60_000;

/** Time left on a quote, with a ring that empties. */
export function Countdown({ until, variant = "inline" }: { until: string; variant?: "inline" | "ring" }) {
  const router = useRouter();
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const l = new Date(until).getTime() - Date.now();
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [until, router]);
  const clamped = Math.max(0, left);
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const text = left <= 0 ? "Expired" : `${m}:${String(s).padStart(2, "0")}`;
  const urgent = left < 120_000;
  if (variant === "inline")
    return <span className={`font-mono font-semibold tabular-nums ${urgent ? "text-rose-600" : "text-slate-900"}`}>{text}</span>;
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, clamped / TOTAL_MS);
  return (
    <div className="relative size-16 shrink-0" role="timer" aria-label={`Time left ${text}`}>
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-slate-100" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} className={`transition-[stroke-dashoffset] duration-1000 ${urgent ? "text-rose-500" : "text-brand-600"}`} />
      </svg>
      <span className={`absolute inset-0 grid place-items-center font-mono text-[13px] font-semibold tabular-nums ${urgent ? "text-rose-600" : "text-slate-900"}`}>{text}</span>
    </div>
  );
}

/** Re-renders the page every few seconds while waiting on the blockchain. */
export function AutoRefresh({ everyMs = 15000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [everyMs, router]);
  return null;
}
