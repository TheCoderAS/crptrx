"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A thin bar at the top of the screen that starts the moment an in-app link is
 * clicked and finishes when the next page arrives, so a click never feels ignored.
 * (Route-level loading.tsx skeletons were tried: they stopped pages updating
 * after a save, so this stays outside the page tree.)
 */
export function NavProgress() {
  const path = usePathname();
  const query = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState("loading");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The new page has arrived: finish the bar, then hide it.
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    const t = setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 300);
    return () => clearTimeout(t);
  }, [path, query]);

  if (state === "idle") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5" aria-hidden>
      <div
        className={`h-full bg-brand-500 shadow-[0_0_8px_var(--color-brand-500)] ${state === "loading" ? "animate-[nav-progress_8s_cubic-bezier(0.1,0.7,0.2,1)_forwards]" : "w-full opacity-0 transition-opacity duration-300"}`}
      />
    </div>
  );
}
