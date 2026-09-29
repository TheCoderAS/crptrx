"use client";
import { useEffect, useState, type ReactNode } from "react";

/** Simple tabs; the chosen tab is kept in the URL hash so a save/refresh stays on it. */
export function Tabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode; alert?: boolean }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  useEffect(() => {
    // Also follow in-page links to a tab (e.g. a banner linking to #onboarding).
    const sync = () => {
      const h = window.location.hash.slice(1);
      if (tabs.some((t) => t.id === h)) setActive(h);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [tabs]);
  return (
    <div>
      <div role="tablist" className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => {
              setActive(t.id);
              history.replaceState(null, "", `#${t.id}`);
            }}
            onKeyDown={(e) => {
              // Left/right arrows move between tabs, as screen-reader users expect.
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const i = tabs.findIndex((x) => x.id === t.id);
              const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
              setActive(next.id);
              history.replaceState(null, "", `#${next.id}`);
              document.getElementById(`tab-${next.id}`)?.focus();
            }}
            className={`relative shrink-0 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition ${active === t.id ? "text-brand-700" : "text-slate-500 hover:text-slate-900"}`}
          >
            {t.label}
            {t.alert && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-rose-500 align-middle" />}
            {active === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="space-y-6">
          {t.content}
        </div>
      ))}
    </div>
  );
}
