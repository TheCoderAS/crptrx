import { BadgeCheck, CheckCircle2, Landmark } from "lucide-react";

/** Decorative floating status chips around the calculator (illustration only). */
export function FloatingChips() {
  return (
    <>
      <div className="animate-float pointer-events-none absolute z-10 -top-5 -left-6 hidden items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-medium shadow-[var(--shadow-float)] ring-1 ring-slate-100 sm:flex" aria-hidden>
        <span className="icon-tile tile-emerald size-8 rounded-xl"><CheckCircle2 className="size-4" /></span>
        Payment received
      </div>
      <div className="animate-float pointer-events-none absolute z-10 -right-10 top-24 hidden items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-medium shadow-[var(--shadow-float)] ring-1 ring-slate-100 [animation-delay:1.5s] sm:flex" aria-hidden>
        <span className="icon-tile tile-blue size-8 rounded-xl"><Landmark className="size-4" /></span>
        Sent to your bank
      </div>
      <div className="animate-float pointer-events-none absolute z-10 -bottom-9 left-8 hidden items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-medium shadow-[var(--shadow-float)] ring-1 ring-slate-100 [animation-delay:3s] lg:flex" aria-hidden>
        <span className="icon-tile tile-violet size-8 rounded-xl"><BadgeCheck className="size-4" /></span>
        Receipt with UTR
      </div>
    </>
  );
}
