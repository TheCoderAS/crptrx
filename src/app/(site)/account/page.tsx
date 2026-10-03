import Link from "next/link";
import type { User } from "@prisma/client";
import { CheckCircle2, ChevronRight, CircleAlert, KeyRound, Landmark, LifeBuoy, Mail, ScanFace, ShieldCheck, Smartphone, UserRound, Wallet } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { USER_MIN_PASSWORD } from "@/server/auth/password";
import { ApiForm } from "@/components/ApiForm";
import { ModalButton, ModalForm } from "@/components/Modal";
import { PasswordInput } from "@/components/PasswordInput";
import { ContactLinks } from "@/components/ContactLinks";
import { contactChannels } from "@/server/contact";
import { PageHeader, StatusPill } from "@/components/ui";
import { PushSetting } from "@/components/PushSetting";
import { appPushReady, webPushReady } from "@/server/firebase/push";
import { nativeAppVersion } from "@/server/appClient";

export const metadata = { title: "Account", robots: { index: false, follow: false } };

const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" });

export default async function Account() {
  const user = await userOrLogin();
  const [s, payouts, wallets, inApp] = await Promise.all([
    getSettings(),
    prisma.payoutMethod.count({ where: { userId: user.id, deletedAt: null } }),
    prisma.userWallet.count({ where: { userId: user.id, deletedAt: null } }),
    nativeAppVersion(),
  ]);
  const mobileOk = !!(user.mobile && user.mobileVerifiedAt);
  const google = !!user.firebaseUid && !user.firebaseUid.startsWith("dev:");
  const methods = [google && "Google", user.passwordHash && "Email and password", user.firebaseUid?.startsWith("dev:") && "Test sign-in"].filter(Boolean) as string[];
  const kycDone = user.kycStatus === "APPROVED";
  const kycOn = s.kyc_required;
  const name = user.displayName ?? user.email.split("@")[0];

  return (
    <div className="space-y-6">
      <PageHeader tab title="Account" subtitle="Your details, payouts and security." icon={<UserRound className="size-6" />} />

      {/* Mobile first when it's the step that's holding them up. */}
      {!mobileOk && s.onboarding_mobile_required && (
        <section className="card ring-2 ring-brand-500/40">
          <div className="mb-4 flex items-start gap-3">
            <span className="icon-tile tile-blue"><Smartphone className="size-5" aria-hidden /></span>
            <div>
              <h2 className="h2">Confirm your mobile number</h2>
              <p className="mt-0.5 text-sm text-slate-500">Needed before you can sell. We&apos;ll send a 6-digit code by SMS.</p>
            </div>
          </div>
          <MobileForms user={user} />
        </section>
      )}

      {/* Profile */}
      <section className="card flex flex-wrap items-center gap-4">
        <span className="bg-brand-gradient grid size-16 shrink-0 place-items-center rounded-2xl text-2xl font-bold text-white shadow-lg shadow-brand-600/25">{name[0].toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-slate-900">{name}</p>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
          <p className="mt-1 text-xs text-slate-500">Member since {dateFmt.format(user.createdAt)}</p>
        </div>
      </section>

      {/* Verification */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold text-slate-900">Verification</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Check icon={<Mail className="size-4" aria-hidden />} label="Email" ok={user.emailVerified} detail={user.emailVerified ? "Confirmed" : "Not confirmed"} action={!user.emailVerified ? <Link href="/verify-email" className="text-xs font-semibold text-brand-700 hover:underline">Confirm</Link> : null} />
          <Check icon={<Smartphone className="size-4" aria-hidden />} label="Mobile" ok={mobileOk} detail={mobileOk ? user.mobile! : s.onboarding_mobile_required ? "Needed" : "Optional"} />
          <Check
            icon={<ScanFace className="size-4" aria-hidden />}
            label="Identity"
            ok={kycDone}
            detail={kycOn || user.kycStatus !== "NOT_STARTED" ? <StatusPill status={user.kycStatus} /> : "Not needed"}
            action={kycOn && !kycDone ? <Link href="/kyc" className="text-xs font-semibold text-brand-700 hover:underline">{user.kycStatus === "NOT_STARTED" ? "Start" : "Open"}</Link> : null}
          />
        </div>
      </section>

      {/* Payouts */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold text-slate-900">Payouts</h2>
        <nav className="card divide-y divide-slate-100 p-0 sm:p-0" aria-label="Payout settings">
          <NavRow href="/payout-methods" icon={<Landmark className="size-4" aria-hidden />} tile="tile-emerald" label="Bank & UPI" detail={payouts ? `${payouts} saved` : "Add where you get paid"} />
          {s.wallet_registration !== "OFF" && (
            <NavRow href="/wallets" icon={<Wallet className="size-4" aria-hidden />} tile="tile-amber" label="Your wallets" detail={wallets ? `${wallets} saved` : s.wallet_registration === "REQUIRED" ? "Needed before you sell" : "Optional"} />
          )}
        </nav>
      </section>

      {/* Sign-in & security */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold text-slate-900">Sign-in &amp; security</h2>
        <div className="card divide-y divide-slate-100 p-0 sm:p-0">
          <SecurityRow icon={<ShieldCheck className="size-4" aria-hidden />} label="Sign-in methods" detail={methods.join(" · ") || "None"} />
          {(inApp ? appPushReady() : webPushReady()) && <PushSetting />}
          {(mobileOk || !s.onboarding_mobile_required) && (
            <SecurityRow
              icon={<Smartphone className="size-4" aria-hidden />}
              label="Mobile number"
              detail={mobileOk ? user.mobile! : "Not added"}
              action={
                <ModalButton button={mobileOk ? "Change" : "Add"} buttonClassName="btn-ghost min-h-9 px-3 text-sm" title={mobileOk ? "Change mobile number" : "Add your mobile number"} description="We'll send a 6-digit code by SMS.">
                  <MobileForms user={user} />
                </ModalButton>
              }
            />
          )}
          {s.auth_email_enabled && (
            <SecurityRow
              icon={<KeyRound className="size-4" aria-hidden />}
              label="Password"
              detail={user.passwordHash ? "Set" : "Not set: lets you log in with your email too"}
              action={
                <ModalForm
                  button={user.passwordHash ? "Change" : "Set"}
                  buttonClassName="btn-ghost min-h-9 px-3 text-sm"
                  title={user.passwordHash ? "Change password" : "Set a password"}
                  description="Other devices are signed out after a change."
                  action="/api/me/password"
                  submitLabel="Save password"
                >
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
                </ModalForm>
              }
            />
          )}
          <p className="px-4 py-3 text-xs text-slate-500 sm:px-5">
            {google ? "Turn on 2-Step Verification in your Google account. " : "Use a password you don't use anywhere else. "}We will never ask for your password or codes by phone or chat.
          </p>
        </div>
      </section>

      {/* The Android app: a download link on the website, the version inside the app. */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold text-slate-900">App</h2>
        <nav className="card divide-y divide-slate-100 p-0 sm:p-0" aria-label="Android app">
          <NavRow href="/app" icon={<Smartphone className="size-4" aria-hidden />} tile="tile-blue" label={inApp ? "VisionPay app" : "Get the Android app"} detail={inApp ? `Version ${inApp}` : "Faster access and reply alerts"} />
        </nav>
      </section>

      {/* Help */}
      <section className="card-flat flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-900"><LifeBuoy className="size-4 text-slate-400" aria-hidden /> Need help?</span>
        <div className="flex-1"><ContactLinks channels={contactChannels(s)} /></div>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500" aria-label="Help and legal">
          <Link href="/help" className="hover:text-slate-900">Help &amp; FAQ</Link>
          <Link href="/terms" className="hover:text-slate-900">Terms</Link>
          <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
        </nav>
      </section>
    </div>
  );
}

function MobileForms({ user }: { user: User }) {
  return (
    <div className="space-y-4">
      <ApiForm action="/api/me/mobile" className="space-y-2">
        <label className="label" htmlFor="mobile">Mobile number</label>
        <div className="flex gap-2">
          <div className="flex flex-1 overflow-hidden rounded-xl shadow-sm ring-1 ring-slate-300 focus-within:ring-2 focus-within:ring-brand-600">
            <span className="grid place-items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">+91</span>
            <input id="mobile" name="mobile" inputMode="numeric" autoComplete="tel-national" required className="w-full min-w-0 bg-transparent px-3 py-2.5 outline-none" placeholder="98765 43210" defaultValue={user.mobile?.replace("+91", "") ?? ""} />
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
  );
}

function Check({ icon, label, ok, detail, action }: { icon: React.ReactNode; label: string; ok: boolean; detail: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card flex items-center gap-3 p-4 sm:p-4">
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm font-medium text-slate-900">
          {label} {ok ? <CheckCircle2 className="size-3.5 text-emerald-600" aria-label="done" /> : <CircleAlert className="size-3.5 text-slate-400" aria-hidden />}
        </p>
        <div className="truncate text-xs text-slate-500">{detail}</div>
      </div>
      {action}
    </div>
  );
}

function NavRow({ href, icon, tile, label, detail }: { href: string; icon: React.ReactNode; tile: string; label: string; detail: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50 sm:px-5">
      <span className={`icon-tile ${tile} size-9 rounded-xl`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        <span className="block truncate text-xs text-slate-500">{detail}</span>
      </span>
      <ChevronRight className="size-4 text-slate-400" aria-hidden />
    </Link>
  );
}

function SecurityRow({ icon, label, detail, action }: { icon: React.ReactNode; label: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        <span className="block truncate text-xs text-slate-500">{detail}</span>
      </span>
      {action}
    </div>
  );
}
