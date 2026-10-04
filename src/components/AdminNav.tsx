"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AlertOctagon, BadgeCheck, FileClock, FlaskConical, Gauge, Gift, HandCoins, Landmark, LifeBuoy, ListOrdered, Menu, ScrollText, Settings, UserRound, Users, X } from "lucide-react";

const ICONS = { Gift, HandCoins, Gauge, BadgeCheck, Landmark, ListOrdered, AlertOctagon, LifeBuoy, Settings, Users, UserRound, FileClock, ScrollText, FlaskConical };
export type AdminNavItem = { href: string; label: string; icon: keyof typeof ICONS; count?: number };

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const path = usePathname();
  const active = (href: string) =>
    href === "/admin" ? path === "/admin" : path.startsWith(href) || (href === "/admin/reviews" && path.startsWith("/admin/kyc"));
  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {items.map(({ href, label, icon, count }) => {
        const Icon = ICONS[icon];
        const on = active(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium lg:py-1.5 lg:text-[13px] transition ${on ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
          >
            <Icon className="size-4" aria-hidden />
            <span className="flex-1 whitespace-nowrap">{label}</span>
            {!!count && <span className="rounded-full bg-amber-400 px-1.5 py-px text-[11px] font-bold text-amber-950 tabular-nums">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Phones and tablets: a top bar with the page name and a Menu button that opens
 * the full navigation as a drawer. The desktop sidebar is hidden below lg.
 */
export function AdminMobileNav({ items, brand, badge, footer }: { items: AdminNavItem[]; brand: ReactNode; badge: ReactNode; footer: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]); // close after navigating
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const current = [...items].sort((a, b) => b.href.length - a.href.length).find((i) => (i.href === "/admin" ? path === "/admin" : path.startsWith(i.href)));
  const waiting = items.reduce((n, i) => n + (i.count ?? 0), 0);
  return (
    <>
      <header className="theme-lock sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-slate-950/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="relative -ml-2 grid size-10 place-items-center rounded-lg text-slate-200 hover:bg-white/10" aria-label="Open menu" aria-expanded={open}>
          <Menu className="size-5" aria-hidden />
          {waiting > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-400" aria-label={`${waiting} waiting`} />}
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{current?.label ?? "Admin"}</p>
        {badge}
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="theme-lock absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              {brand}
              <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-lg text-slate-300 hover:bg-white/10" aria-label="Close menu">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3"><AdminNav items={items} /></div>
            <div className="border-t border-white/10 p-4">{footer}</div>
          </div>
        </div>
      )}
    </>
  );
}
