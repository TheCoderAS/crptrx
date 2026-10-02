"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Check, ChevronDown, ListFilter } from "lucide-react";

type Item = { href: string; label: string; active: boolean };

/**
 * A list filter tucked behind one button, instead of a row of chips. The first
 * item is the default view; the button shows the chosen one by name. Closes on
 * outside click, Escape, or a pick.
 */
export function FilterMenu({ items }: { items: Item[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current?.open && (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current.contains(e.target as Node))) ref.current.open = false;
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  const active = items.find((i) => i.active) ?? items[0];
  const filtered = active !== items[0];
  return (
    <details ref={ref} key={active?.href} className="relative">
      <summary className={`btn-secondary cursor-pointer list-none gap-2 whitespace-nowrap [&::-webkit-details-marker]:hidden ${filtered ? "text-brand-700 ring-brand-400" : ""}`}>
        <ListFilter className="size-4" aria-hidden />
        {filtered ? active.label : "Filter"}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </summary>
      <div className="absolute right-0 z-30 mt-2 max-h-[60vh] w-56 overflow-y-auto rounded-xl bg-white p-1 shadow-[var(--shadow-float)] ring-1 ring-slate-200">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => ref.current && (ref.current.open = false)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${i.active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
          >
            {i.label}
            {i.active && <Check className="size-4 text-brand-600" aria-hidden />}
          </Link>
        ))}
      </div>
    </details>
  );
}
