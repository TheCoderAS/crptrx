"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string; hint?: string };

/**
 * In-app dropdown in place of the browser's <select>, styled like the rest of the
 * app (dark mode included). Works inside plain forms: the value travels in a
 * hidden input, a pick fires an "input" event (so unsaved-change bars notice),
 * and the form's reset/Discard puts the starting value back.
 * Keyboard: Enter/Space/arrows open it, arrows move, Enter picks, Escape closes.
 */
export function Select({
  name,
  options,
  defaultValue,
  value,
  onChange,
  id,
  className = "",
  "aria-label": ariaLabel,
  icon,
}: {
  name?: string;
  options: SelectOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  id?: string;
  className?: string;
  "aria-label"?: string;
  icon?: ReactNode;
}) {
  const start = defaultValue ?? options[0]?.value ?? "";
  const [inner, setInner] = useState(start);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === current) ?? options[0];

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  // Form reset (e.g. "Discard") restores the starting value.
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const reset = () => setInner(start);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [start]);

  const pick = (v: string) => {
    setOpen(false);
    button.current?.focus();
    if (v === current) return;
    if (value === undefined) setInner(v);
    onChange?.(v);
    // Let the surrounding form know (SettingsForm shows its save bar on input).
    queueMicrotask(() => hidden.current?.dispatchEvent(new Event("input", { bubbles: true })));
  };

  const openList = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      {name && <input ref={hidden} type="hidden" name={name} value={current} />}
      <button
        ref={button}
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            openList();
          } else if (open && e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (open && e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (open && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            pick(options[active].value);
          } else if (open && (e.key === "Escape" || e.key === "Tab")) {
            if (e.key === "Escape") e.stopPropagation();
            setOpen(false);
          }
        }}
        className={`input flex items-center gap-2 text-left ${icon ? "pl-9" : ""}`}
      >
        {icon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400">{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDown className={`size-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-40 mt-1.5 max-h-72 w-full min-w-48 overflow-y-auto rounded-xl bg-white p-1 shadow-[var(--shadow-float)] ring-1 ring-slate-200"
        >
          {options.map((o, i) => {
            const on = o.value === current;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={on}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()} // keep focus on the button
                onClick={() => pick(o.value)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${i === active ? "bg-slate-100" : ""} ${on ? "font-medium text-slate-900" : "text-slate-700"}`}
              >
                <span className="min-w-0 flex-1">
                  {o.label}
                  {o.hint && <span className="block text-xs font-normal text-slate-500">{o.hint}</span>}
                </span>
                {on && <Check className="size-4 shrink-0 text-brand-600" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
