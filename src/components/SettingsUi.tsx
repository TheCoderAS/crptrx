import type { ReactNode } from "react";
import { Info } from "lucide-react";

// Building blocks for admin settings: compact rows, label on the left, control
// on the right, extra explanation behind an (i) instead of paragraphs of text.

export function Group({ title, icon, tile = "tile-slate", note, children, action }: { title: string; icon?: ReactNode; tile?: string; note?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card p-0 sm:p-0">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        {icon && <span className={`icon-tile ${tile} size-8 rounded-lg [&_svg]:size-4`}>{icon}</span>}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {note && <p className="text-xs text-slate-500">{note}</p>}
        </div>
        {action}
      </header>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

/** Small (i) with the explanation on hover / keyboard focus. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" className="grid size-5 place-items-center rounded-full text-slate-400 hover:text-slate-700 focus-visible:text-slate-700" aria-label="More info">
        <Info className="size-3.5" aria-hidden />
      </button>
      <span role="tooltip" className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-1.5 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed font-normal text-white opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 theme-lock">
        {children}
      </span>
    </span>
  );
}

export function SettingRow({ label, htmlFor, hint, warn, children, wide }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; warn?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`grid gap-2 px-4 py-3 ${wide ? "" : "sm:grid-cols-[1fr_minmax(0,16rem)] sm:items-center"}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <label htmlFor={htmlFor} className="text-sm font-medium text-slate-800">{label}</label>
          {hint && <Hint>{hint}</Hint>}
        </div>
        {warn && <p className="mt-0.5 text-xs font-medium text-amber-700">{warn}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Number / text box with a unit shown inside it (%, ₹, USDT, hours). */
export function UnitInput({ name, value, unit, type = "text", disabled, prefix }: { name: string; value: string | number; unit?: string; prefix?: string; type?: string; disabled?: boolean }) {
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">{prefix}</span>}
      <input
        id={name}
        name={name}
        type={type}
        inputMode={type === "number" ? "numeric" : "decimal"}
        defaultValue={String(value)}
        disabled={disabled}
        className={`input py-2 text-sm tabular-nums ${prefix ? "pl-7" : ""} ${unit ? "pr-14" : ""} disabled:opacity-60`}
      />
      {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-400">{unit}</span>}
    </div>
  );
}

export function TextInput({ name, value, placeholder, mono }: { name: string; value: string; placeholder?: string; mono?: boolean }) {
  return <input id={name} name={name} defaultValue={value} placeholder={placeholder} className={`input py-2 text-sm ${mono ? "font-mono" : ""}`} />;
}

/** On/off switch. The form sends true/false (see SettingsForm). */
export function Switch({ name, checked, label }: { name: string; checked: boolean; label: string }) {
  return (
    <span className="flex justify-end">
      <span className="relative inline-flex">
        <input type="checkbox" id={name} name={name} defaultChecked={checked} aria-label={label} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2" />
        <span className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-[#fff] shadow transition peer-checked:translate-x-5" />
        <label htmlFor={name} className="absolute inset-0 cursor-pointer" aria-hidden />
      </span>
    </span>
  );
}

/** Segmented choice (e.g. Manual / Auto) as radio buttons. */
export function Segmented({ name, value, options }: { name: string; value: string; options: { value: string; label: string }[] }) {
  return (
    <div className="inline-grid w-full auto-cols-fr grid-flow-col gap-1 rounded-lg bg-slate-200/70 p-1" role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className="cursor-pointer">
          <input type="radio" name={name} value={o.value} defaultChecked={value === o.value} className="peer sr-only" />
          <span className="block rounded-md px-3 py-1.5 text-center text-sm font-medium text-slate-500 transition peer-checked:bg-[var(--surface,#fff)] peer-checked:text-slate-900 peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}
