"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function Countdown({ until }: { until: string }) {
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
  if (left <= 0) return <span className="font-semibold text-red-700">Expired</span>;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return <span className={`font-mono text-lg font-bold ${left < 120_000 ? "text-red-700" : "text-gray-900"}`}>{m}:{String(s).padStart(2, "0")}</span>;
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
