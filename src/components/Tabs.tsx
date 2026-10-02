"use client";
import { useEffect, useState, type ReactNode } from "react";

type Tab = { id: string; label: string; content: ReactNode; alert?: boolean; icon?: ReactNode };

/**
 * Tabs; the chosen tab is kept in the URL hash so a save/refresh stays on it.
 * layout="side": a menu on the left on wide screens (scrolling chips on phones).
 */
export function Tabs({ tabs, layout = "top" }: { tabs: Tab[]; layout?: "top" | "side" }) {
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
  const side = layout === "side";
  const select = (id: string) => {
    setActive(id);
    history.replaceState(null, "", `#${id}`);
  };
  return (
    <div className={side ? "lg:grid lg:grid-cols-[13rem_1fr] lg:items-start lg:gap-6" : ""}>
      <div
        role="tablist"
        aria-orientation={side ? "vertical" : "horizontal"}
        className={
          side
            ? "-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-4 lg:mx-0 lg:mb-0 lg:flex-col lg:overflow-visible lg:px-0"
            : "-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0"
        }
      >
        {tabs.map((t) => {
          const on = active === t.id;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => select(t.id)}
              onKeyDown={(e) => {
                // Arrow keys move between tabs, as screen-reader users expect.
                const keys = side ? ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"] : ["ArrowRight", "ArrowLeft"];
                if (!keys.includes(e.key)) return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === t.id);
                const fwd = e.key === "ArrowRight" || e.key === "ArrowDown";
                const next = tabs[(i + (fwd ? 1 : tabs.length - 1)) % tabs.length];
                select(next.id);
                document.getElementById(`tab-${next.id}`)?.focus();
              }}
              className={
                side
                  ? `flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition ${on ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`
                  : `relative shrink-0 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition ${on ? "text-brand-700" : "text-slate-500 hover:text-slate-900"}`
              }
            >
              {t.icon && <span className={`[&_svg]:size-4 ${on ? "text-brand-600" : "text-slate-400"}`} aria-hidden>{t.icon}</span>}
              <span className="flex-1">{t.label}</span>
              {t.alert && <span className="inline-block size-1.5 rounded-full bg-rose-500" aria-label="needs attention" />}
              {!side && on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
            </button>
          );
        })}
      </div>
      <div className="min-w-0">
        {tabs.map((t) => (
          <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="space-y-4">
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
