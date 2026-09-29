import Link from "next/link";
import { ChevronRight, CheckCircle2, Landmark, UserRound, Wallet } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { getSettings } from "@/server/settings";
import { USER_MIN_PASSWORD } from "@/server/auth/password";
import { ApiForm } from "@/components/ApiForm";
import { PasswordInput } from "@/components/PasswordInput";
import { ContactLinks } from "@/components/ContactLinks";
import { contactChannels } from "@/server/contact";
import { Banner, PageHeader, Row, Section, StatusPill } from "@/components/ui";
import { fmtIST } from "@/lib/time";

export const metadata = { title: "Account", robots: { index: false, follow: false } };

export default async function Account() {
  const user = await userOrLogin();
  const s = await getSettings();
  const verified = !!(user.mobile && user.mobileVerifiedAt);
  const google = !!user.firebaseUid && !user.firebaseUid.startsWith("dev:");
  const methods = [google && "Google", user.passwordHash && "Email and password", user.firebaseUid?.startsWith("dev:") && "Test sign-in"].filter(Boolean).join(" · ") || "None";
  return (
    <div className="space-y-6">
      <PageHeader title="Account" subtitle="Your details and security." icon={<UserRound className="size-6" />} />

      <Section>
        <div className="mb-3 flex items-center gap-4">
          <span className="bg-brand-gradient grid size-14 place-items-center rounded-2xl text-xl font-bold text-white shadow-lg shadow-brand-600/25">{(user.displayName ?? user.email)[0].toUpperCase()}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{user.displayName ?? user.email}</p>
            {user.displayName && <p className="truncate text-sm text-slate-500">{user.email}</p>}
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          <Row k="Sign-in" v={methods} />
          <Row k="Mobile" v={verified ? <span className="inline-flex items-center gap-1.5">{user.mobile} <CheckCircle2 className="size-4 text-emerald-600" aria-label="confirmed" /></span> : "Not confirmed"} />
          <Row k="Identity check" v={<StatusPill status={user.kycStatus} />} />
          <Row k="Member since" v={fmtIST(user.createdAt)} />
        </div>
      </Section>

      <nav className="card divide-y divide-slate-100 p-0 sm:p-0" aria-label="Account shortcuts">
        {[
          { href: "/payout-methods", icon: Landmark, tile: "tile-emerald", label: "Bank & UPI", show: true },
          { href: "/wallets", icon: Wallet, tile: "tile-amber", label: "Your wallets", show: s.wallet_registration !== "OFF" },
        ].filter((x) => x.show).map(({ href, icon: Icon, tile, label }) => (
          <Link key={href} href={href} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50 first:rounded-t-2xl last:rounded-b-2xl">
            <span className={`icon-tile ${tile} size-9 rounded-xl`}><Icon className="size-4" aria-hidden /></span>
            <span className="flex-1 text-sm font-medium text-slate-900">{label}</span>
            <ChevronRight className="size-4 text-slate-400" aria-hidden />
          </Link>
        ))}
      </nav>

      <Section title={verified ? "Change mobile number" : s.onboarding_mobile_required ? "Confirm your mobile number" : "Add your mobile number (optional)"} description="We'll send a 6-digit code by SMS.">
        <div className="space-y-5">
          <ApiForm action="/api/me/mobile" className="space-y-2">
            <label className="label" htmlFor="mobile">Mobile number</label>
            <div className="flex gap-2">
              <div className="flex flex-1 overflow-hidden rounded-xl shadow-sm ring-1 ring-slate-300 focus-within:ring-2 focus-within:ring-brand-600">
                <span className="grid place-items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">+91</span>
                <input id="mobile" name="mobile" inputMode="numeric" autoComplete="tel-national" required className="w-full min-w-0 px-3 py-2.5 outline-none" placeholder="98765 43210" defaultValue={user.mobile?.replace("+91", "") ?? ""} />
              </div>
              <button className="btn-secondary">Send code</button>
            </div>
          </ApiForm>
          <ApiForm action="/api/me/mobile/verify" className="space-y-2">
            <label className="label" htmlFor="code">6-digit code</label>
            <div className="flex gap-2">
              <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="input font-mono tracking-[0.4em]" placeholder="••••••" />
              <button className="btn-primary">Confirm</button>
            </div>
          </ApiForm>
        </div>
      </Section>

      {s.auth_email_enabled && (
        <Section title={user.passwordHash ? "Change password" : "Set a password"} description={user.passwordHash ? undefined : "Lets you log in with your email as well."}>
          <ApiForm action="/api/me/password" className="space-y-4" resetOnSuccess>
            {user.passwordHash && (
              <div>
                <label className="label" htmlFor="current">Current password</label>
                <PasswordInput id="current" name="current" autoComplete="current-password" />
              </div>
            )}
            <div>
              <label className="label" htmlFor="password">New password</label>
              <PasswordInput id="password" autoComplete="new-password" minLength={USER_MIN_PASSWORD} />
              <p className="hint">At least {USER_MIN_PASSWORD} characters.</p>
            </div>
            <button className="btn-primary">Save password</button>
          </ApiForm>
        </Section>
      )}

      <Banner tone="info" title="Keep your account safe">
        {google ? "Turn on 2-Step Verification in your Google settings. " : "Use a password you don't use anywhere else. "}We will never ask for your password or codes by phone or chat.
      </Banner>
      <div className="card-flat space-y-3">
        <p className="text-sm font-medium text-slate-900">Need help?</p>
        <ContactLinks channels={contactChannels(s)} />
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500" aria-label="Help and legal">
          <Link href="/help" className="hover:text-slate-900">Help &amp; FAQ</Link>
          <Link href="/terms" className="hover:text-slate-900">Terms</Link>
          <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
        </nav>
      </div>
    </div>
  );
}
