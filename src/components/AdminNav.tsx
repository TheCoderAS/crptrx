"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertOctagon, BadgeCheck, FileClock, FlaskConical, Gauge, Landmark, LifeBuoy, ListOrdered, ScrollText, Settings, Users } from "lucide-react";

const ICONS = { Gauge, BadgeCheck, Landmark, ListOrdered, AlertOctagon, LifeBuoy, Settings, Users, FileClock, ScrollText, FlaskConical };
export type AdminNavItem = { href: string; label: string; icon: keyof typeof ICONS; count?: number };

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {items.map(({ href, label, icon, count }) => {
        const Icon = ICONS[icon];
        const on = active(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${on ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
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
