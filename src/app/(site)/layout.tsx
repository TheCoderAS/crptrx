import Link from "next/link";
import { BadgeCheck, Lock, ShieldCheck } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { getSettings, isRealValue } from "@/server/settings";
import { LogoutButton } from "@/components/LogoutButton";
import { DesktopNav, MobileTabs } from "@/components/SiteNav";
import { Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [user, s] = await Promise.all([currentUser(), getSettings()]);
  return (
    <div className="flex min-h-screen flex-col">
      {s.network_mode === "TEST" && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">Test mode: test networks only. No real USDT or rupees move.</div>
      )}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Link href={user ? "/dashboard" : "/"} aria-label={`${s.brand_name} home`}>
            <Logo name={s.brand_name} />
          </Link>
          {user ? (
            <div className="flex items-center gap-2">
              <DesktopNav />
              <span className="mx-1 hidden h-6 w-px bg-slate-200 md:block" />
              <LogoutButton action="/api/auth/logout" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/help" className="btn-ghost hidden sm:inline-flex">Help</Link>
              <Link href="/login" className="btn-primary">Log in</Link>
            </div>
          )}
        </div>
      </header>

      <main className={`mx-auto w-full flex-1 px-4 py-6 sm:py-10 ${user ? "max-w-4xl pb-24 md:pb-10" : "max-w-5xl"}`}>{children}</main>

      <footer className={`border-t border-slate-200 bg-white ${user ? "pb-20 md:pb-0" : ""}`}>
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-slate-600">
            {isRealValue(s.company_fiu_reg) && <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-emerald-600" aria-hidden /> FIU registration no. {s.company_fiu_reg}</span>}
            <span className="inline-flex items-center gap-1.5"><BadgeCheck className="size-4 text-emerald-600" aria-hidden /> Verified users only (KYC)</span>
            <span className="inline-flex items-center gap-1.5"><Lock className="size-4 text-emerald-600" aria-hidden /> Payouts only to your own account</span>
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 text-xs text-slate-500">
            <div>
              {isRealValue(s.company_name) && <p className="font-medium text-slate-700">{s.company_name}</p>}
              <p>{isRealValue(s.company_address) && s.company_address}{isRealValue(s.company_gstin) && ` · GSTIN ${s.company_gstin}`}</p>
            </div>
            <nav className="flex gap-4" aria-label="Legal">
              <Link href="/help" className="hover:text-slate-900">Help &amp; FAQ</Link>
              <Link href="/terms" className="hover:text-slate-900">Terms</Link>
              <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
            </nav>
          </div>
        </div>
      </footer>
      {user && <MobileTabs />}
    </div>
  );
}
