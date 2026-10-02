import { logoSrc } from "@/server/brand";
import Link from "next/link";
import { BadgeCheck, Lock, ShieldCheck } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { getSettings, isRealValue } from "@/server/settings";
import { companyName } from "@/server/contact";
import { Suspense } from "react";
import { LivePulse } from "@/components/LivePulse";
import { NavProgress } from "@/components/NavProgress";
import { LogoutButton } from "@/components/LogoutButton";
import { DesktopNav, MobileTabs } from "@/components/SiteNav";
import { GuestNav } from "@/components/GuestNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [user, s] = await Promise.all([currentUser(), getSettings()]);
  // Someone who still has to confirm their email only gets "Log out", not the app navigation.
  const pending = !!user && !user.emailVerified && s.auth_email_verification_required;
  const nav = !!user && !pending;
  // Header, content and footer share one width so their edges line up.
  const width = user ? "max-w-4xl" : "max-w-5xl";
  return (
    <div className="flex min-h-screen flex-col">
      {user && <LivePulse url="/api/me/pulse" everyMs={30_000} />}
      <Suspense fallback={null}><NavProgress /></Suspense>
      {s.network_mode === "TEST" && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">Test mode: test networks only. No real USDT or rupees move.</div>
      )}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className={`mx-auto flex h-16 ${width} items-center justify-between gap-3 px-4`}>
          <Link href={user ? "/dashboard" : "/"} aria-label={`${s.brand_name} home`}>
            <Logo name={s.brand_name} src={logoSrc(s)} />
          </Link>
          {user ? (
            <div className="flex items-center gap-2">
              {nav && <DesktopNav />}
              {nav && <span className="mx-1 hidden h-6 w-px bg-slate-200 md:block" />}
              <ThemeToggle />
              <LogoutButton action="/api/auth/logout" />
            </div>
          ) : (
            <GuestNav />
          )}
        </div>
      </header>

      <main className={`mx-auto w-full flex-1 px-4 py-6 sm:py-10 ${width} ${nav ? "pb-28 md:pb-12" : ""}`}>{children}</main>

      {/* Marketing footer for visitors only; signed-in users find Help, Terms and Privacy on the Account page. */}
      {!user && (
      <footer className="border-t border-slate-200 bg-white">
        <div className={`mx-auto ${width} px-4 py-8`}>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-slate-600">
            {isRealValue(s.company_fiu_reg) && <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-emerald-600" aria-hidden /> FIU registration no. {s.company_fiu_reg}</span>}
            {s.kyc_required && <span className="inline-flex items-center gap-1.5"><BadgeCheck className="size-4 text-emerald-600" aria-hidden /> Verified users only (KYC)</span>}
            <span className="inline-flex items-center gap-1.5"><Lock className="size-4 text-emerald-600" aria-hidden /> Payouts only to your own account</span>
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 text-xs text-slate-500">
            <div>
              <p className="font-medium text-slate-700">{companyName(s)}</p>
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
      )}
      {nav && <MobileTabs />}
    </div>
  );
}
