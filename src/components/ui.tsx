import { InfoTip } from "./InfoTip";
import type { ReactNode } from "react";
import Link from "next/link";
import { Dismissible } from "./Dismissible";
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

/** The app's logo: the admin's uploaded image when there is one, else the built-in mark. */
export function Logo({ name, inverted, size = "md", src }: { name: string; inverted?: boolean; size?: "md" | "lg"; src?: string | null }) {
  const box = size === "lg" ? "size-10" : "size-8";
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className={`${box} shrink-0 rounded-xl object-contain`} />
      ) : (
      <span className={`${box} grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-sm`}>
        <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 7h11l-3-3" />
          <path d="M17 17H6l3 3" />
        </svg>
      </span>
      )}
      {/* Nudged down: the line box keeps room for descenders, so capitals sit above the mark's middle. */}
      <span className={`translate-y-[1.5px] truncate leading-tight font-semibold tracking-tight whitespace-nowrap ${size === "lg" ? "text-xl" : "text-[17px]"} ${inverted ? "text-white" : "text-slate-900"}`}>{name}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Networks: each has its own colour everywhere (spec 12)
// ---------------------------------------------------------------------------

export function NetworkMark({ network, size = 20 }: { network: NetworkCode | string; size?: number }) {
  const tron = network === "TRON";
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full font-bold text-white ${tron ? "bg-red-600" : "bg-amber-400 text-amber-950"}`}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      aria-hidden
    >
      {tron ? "T" : "B"}
    </span>
  );
}

export function NetworkBadge({ network, large }: { network: NetworkCode | string; large?: boolean }) {
  const info = NETWORK_INFO[network as NetworkCode];
  if (!info) return <span>{network}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${info.badge} ${large ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-xs"}`}>
      <NetworkMark network={network} size={large ? 18 : 14} />
      {info.name}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const STATUS: Record<string, { label: string; tone: string }> = {
  QUOTE_READY: { label: "Awaiting payment", tone: "blue" },
  EXPIRED: { label: "Expired", tone: "slate" },
  PAYMENT_SUBMITTED: { label: "Checking payment", tone: "indigo" },
  PAYMENT_CONFIRMED: { label: "Payment received", tone: "teal" },
  UNDER_REVIEW: { label: "In review", tone: "violet" },
  ON_HOLD: { label: "On hold", tone: "amber" },
  APPROVED: { label: "Approved", tone: "lime" },
  PAID: { label: "Paid", tone: "green" },
  CLOSED_MANUAL: { label: "Closed", tone: "slate" },
  NOT_STARTED: { label: "Not started", tone: "slate" },
  SUBMITTED: { label: "In review", tone: "indigo" },
  NEEDS_CHANGES: { label: "Needs changes", tone: "amber" },
  DECLINED: { label: "Declined", tone: "rose" },
  PENDING: { label: "Pending review", tone: "amber" },
  UNMATCHED: { label: "Unmatched", tone: "amber" },
  MANUAL_HANDLING: { label: "Manual handling", tone: "slate" },
  MATCHED: { label: "Matched", tone: "green" },
  IGNORED_WRONG_TOKEN: { label: "Wrong token", tone: "rose" },
  ACTIVE: { label: "Active", tone: "green" },
  DISABLED: { label: "Disabled", tone: "slate" },
};
const TONE: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  lime: "bg-lime-50 text-lime-800 ring-lime-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};
const DOT: Record<string, string> = {
  blue: "bg-blue-500", indigo: "bg-indigo-500", teal: "bg-teal-500", violet: "bg-violet-500", amber: "bg-amber-500",
  lime: "bg-lime-500", green: "bg-emerald-500", rose: "bg-rose-500", slate: "bg-slate-400",
};

export const statusLabel = (s: string) => STATUS[s]?.label ?? s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = STATUS[status]?.tone ?? "slate";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONE[tone]}`}>
      <span className={`size-1.5 rounded-full ${DOT[tone]}`} />
      {label ?? statusLabel(status)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/**
 * Page title row. `tab`: the page is one of the mobile bottom-bar tabs, which
 * already shows where you are, so on phones the title is for screen readers only.
 */
export function PageHeader({ title, subtitle, action, eyebrow, icon, tile = "tile-blue", tab }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; eyebrow?: ReactNode; icon?: ReactNode; tile?: string; tab?: boolean }) {
  const m = (cls: string) => (tab ? `${cls} max-md:hidden` : cls);
  return (
    <div data-page-header className={`flex flex-wrap items-center justify-between gap-3 ${tab ? "mb-6 max-md:mb-0" : "mb-6"}`}>
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
      {icon && <span className={m(`icon-tile ${tile} size-12 rounded-2xl shadow-lg`)}>{icon}</span>}
      <div className="min-w-0">
        {eyebrow && <p className={m("eyebrow mb-1")}>{eyebrow}</p>}
        <h1 className={tab ? "h1 max-md:sr-only" : "h1"}>{title}</h1>
        {subtitle && <p className={m("mt-1 text-[15px] text-slate-500")}>{subtitle}</p>}
      </div>
      </div>
      {action && <div className={m("")}>{action}</div>}
    </div>
  );
}

export function Section({ title, description, info, action, children, className = "" }: { title?: ReactNode; description?: ReactNode; info?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="h2 flex items-center gap-1">{title}{info && <InfoTip>{info}</InfoTip>}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A notice with an × to hide it (remembered per browser until its text changes). */
export function Banner({ tone = "info", title, children, id }: { tone?: "info" | "warn" | "danger" | "ok"; title?: ReactNode; children: ReactNode; id?: string }) {
  const c = {
    info: ["bg-brand-50 text-brand-900 ring-brand-200", Info, "text-brand-600"],
    warn: ["bg-amber-50 text-amber-900 ring-amber-200", AlertTriangle, "text-amber-600"],
    danger: ["bg-rose-50 text-rose-900 ring-rose-200", ShieldAlert, "text-rose-600"],
    ok: ["bg-emerald-50 text-emerald-900 ring-emerald-200", CheckCircle2, "text-emerald-600"],
  }[tone] as [string, typeof Info, string];
  const Icon = c[1];
  return (
    <Dismissible id={id}>
      <div className={`flex gap-3 rounded-xl p-3.5 text-sm ring-1 ring-inset ${c[0]}`} role={tone === "danger" ? "alert" : undefined}>
        <Icon className={`mt-0.5 size-4 shrink-0 ${c[2]}`} aria-hidden />
        <div className="min-w-0 leading-relaxed">
          {title && <p className="font-semibold">{title}</p>}
          {children}
        </div>
      </div>
    </Dismissible>
  );
}

export function Row({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 text-sm ${strong ? "text-base" : ""}`}>
      <span className={`shrink-0 ${strong ? "font-semibold text-slate-900" : "text-slate-500"}`}>{k}</span>
      <span className={`min-w-0 text-right font-medium [overflow-wrap:anywhere] text-slate-900 ${strong ? "money text-lg" : ""}`}>{v}</span>
    </div>
  );
}

export function Stat({ label, value, sub, href, icon, tile = "tile-blue", className = "" }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; icon?: ReactNode; tile?: string; className?: string }) {
  const inner = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      {icon && <span className={`icon-tile ${tile} size-10 sm:size-11`}>{icon}</span>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
        <p className="money mt-1 truncate text-xl text-slate-900 sm:text-2xl">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
  return href ? (
    <a href={href} className={`card block transition hover:border-brand-200 hover:shadow-[var(--shadow-raised)] ${className}`}>{inner}</a>
  ) : (
    <div className={`card ${className}`}>{inner}</div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {icon && <div className="icon-tile tile-blue mb-4 size-14 rounded-2xl shadow-lg shadow-blue-500/20">{icon}</div>}
      <p className="font-medium text-slate-900">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Horizontal progress tracker (e.g. Payment → Review → Paid). */
export function Steps({ steps, current, failed }: { steps: string[]; current: number; failed?: boolean }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Order progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={active ? "step" : undefined}>
            <span
              className={`h-1.5 rounded-full ${done ? "bg-emerald-500" : active ? (failed ? "bg-amber-400" : "bg-brand-600") : "bg-slate-200"}`}
            />
            <span className={`truncate text-xs ${done || active ? "font-medium text-slate-800" : "text-slate-400"}`}>
              {s}
              {active && failed && <span className="text-amber-700"> · paused</span>}
              {done && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Timeline({ events }: { events: { id: string; toStatus: string; createdAt: Date; publicMessage: string | null; privateNote?: string | null; actorType?: string }[] }) {
  return (
    <ol className="relative space-y-5 border-l border-slate-200 pl-5">
      {events.map((e, i) => (
        <li key={e.id} className="relative">
          <span className={`absolute top-1 -left-[26px] size-3 rounded-full ring-4 ring-white ${i === events.length - 1 ? "bg-brand-600" : "bg-slate-300"}`} />
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={e.toStatus} />
            <time className="text-xs text-slate-500">{fmtIST(e.createdAt)}</time>
            {e.actorType && <span className="text-xs text-slate-400">by {e.actorType.toLowerCase()}</span>}
          </div>
          {e.publicMessage && <p className="mt-1 text-sm text-slate-700">{e.publicMessage}</p>}
          {e.privateNote && <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200 ring-inset">Private note: {e.privateNote}</p>}
        </li>
      ))}
    </ol>
  );
}

/** "← Orders": the way back from a detail screen to the list it came from. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="pb-1">
      <Link href={href} className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> {children}
      </Link>
    </div>
  );
}

