import type { ReactNode } from "react";
import { Landmark, Lock, ReceiptText, Timer } from "lucide-react";
import { ApiForm } from "./ApiForm";
import { Banner, Logo } from "./ui";

const PERKS = [
  { icon: Timer, tile: "tile-blue", t: "Price locked 15 minutes" },
  { icon: Landmark, tile: "tile-violet", t: "Paid to your own bank or UPI" },
  { icon: ReceiptText, tile: "tile-emerald", t: "Receipt with bank reference" },
];

/** Split-screen frame shared by every sign-in page. */
export function AuthShell({ brand, logo, title, subtitle, children, footer }: { brand: string; logo?: string | null; title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[var(--shadow-float)] lg:grid-cols-2">
      <div className="bg-mesh-dark relative hidden flex-col justify-between p-10 text-white lg:flex">
        <Logo name={brand} src={logo} inverted size="lg" />
        <div>
          <h2 className="text-3xl leading-tight font-bold tracking-tight">Sell USDT.<br />Get rupees you can <span className="text-emerald-300">trace.</span></h2>
          <ul className="mt-8 space-y-4">
            {PERKS.map(({ icon: Icon, tile, t }) => (
              <li key={t} className="flex items-center gap-3">
                <span className={`icon-tile ${tile} size-10 rounded-xl`}><Icon className="size-5" aria-hidden /></span>
                <span className="font-medium text-white/90">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="flex items-center gap-2 text-xs text-white/60"><Lock className="size-3.5" aria-hidden /> Passwords are stored hashed. Sessions stay on this device only.</p>
      </div>
      <div className="flex flex-col justify-center p-6 sm:p-10">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
        <div className="mt-8 space-y-4">{children}</div>
        {footer && <div className="mt-8 text-sm text-slate-600">{footer}</div>}
      </div>
    </div>
  );
}

export function OrDivider({ label = "or" }: { label?: string }) {
  return <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /> {label} <span className="h-px flex-1 bg-slate-200" /></div>;
}

/** Test-phase sign-in without a password. Folded away when real methods are shown. */
export function DevLogin({ collapsed }: { collapsed: boolean }) {
  const form = (
    <div className="space-y-3">
      <Banner tone="warn">Test sign-in: any email, no password. Switched off automatically in Live mode.</Banner>
      <ApiForm action="/api/auth/dev-login" className="space-y-3">
        <div>
          <label className="label" htmlFor="dev-email">Test email</label>
          <input id="dev-email" name="email" type="email" required autoComplete="off" className="input" placeholder="tester@example.com" />
        </div>
        <button className="btn-secondary btn-lg w-full">Continue with test sign-in</button>
      </ApiForm>
    </div>
  );
  if (!collapsed) return form;
  return (
    <details className="group rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-3 [&[open]]:pb-4">
      <summary className="cursor-pointer text-sm font-medium text-amber-800 marker:text-amber-500">Test sign-in (no password)</summary>
      <div className="mt-3">{form}</div>
    </details>
  );
}
