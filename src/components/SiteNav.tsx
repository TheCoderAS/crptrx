"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Home, ListOrdered, UserRound } from "lucide-react";

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/sell", label: "Sell", icon: ArrowLeftRight },
  { href: "/orders", label: "Orders", icon: ListOrdered },
  { href: "/account", label: "Account", icon: UserRound },
];

const isActive = (path: string, href: string) => path === href || (href !== "/dashboard" && path.startsWith(href));

/** Desktop: links in the header. */
export function DesktopNav() {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
      {ITEMS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(path, href) ? "page" : undefined}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${isActive(path, href) ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:text-slate-900"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Mobile: app-style tab bar pinned to the bottom. */
export function MobileTabs() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${active ? "text-brand-700" : "text-slate-500"}`}>
              <Icon className="size-5" strokeWidth={active ? 2.4 : 2} aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
