"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps the open page current without reloading it: asks `url` "has anything
 * changed?" every `everyMs` while the tab is visible (and at once when you come
 * back to it), and re-renders the page only when the answer changes. Typing and
 * scroll position are kept.
 */
export function LivePulse({ url, everyMs }: { url: string; everyMs: number }) {
  const router = useRouter();
  useEffect(() => {
    let last: string | null = null;
    let busy = false;
    let stopped = false;
    const check = async () => {
      if (stopped || busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.status === 401 || res.status === 403) return void (stopped = true); // signed out: the next click handles it
        if (!res.ok) return;
        const { sig } = (await res.json()) as { sig?: string };
        if (!sig) return;
        if (last !== null && sig !== last) router.refresh();
        last = sig;
      } catch {
        /* offline for a moment: try again next time */
      } finally {
        busy = false;
      }
    };
    void check();
    const t = setInterval(check, everyMs);
    const onShow = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [url, everyMs, router]);
  return null;
}
