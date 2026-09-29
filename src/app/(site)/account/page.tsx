import { CheckCircle2 } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { ApiForm } from "@/components/ApiForm";
import { Banner, PageHeader, Row, Section, StatusPill } from "@/components/ui";
import { fmtIST } from "@/lib/time";

export const metadata = { title: "Account" };

export default async function Account() {
  const user = await userOrLogin();
  const verified = !!(user.mobile && user.mobileVerifiedAt);
  return (
    <div className="space-y-6">
      <PageHeader title="Account" subtitle="Your details and security." />

      <Section>
        <div className="mb-3 flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-lg font-semibold text-brand-700">{(user.displayName ?? user.email)[0].toUpperCase()}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{user.displayName ?? user.email}</p>
            <p className="truncate text-sm text-slate-500">{user.email}</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          <Row k="Sign-in" v={user.firebaseUid?.startsWith("dev:") ? "Test sign-in" : "Google"} />
          <Row k="Mobile" v={verified ? <span className="inline-flex items-center gap-1.5">{user.mobile} <CheckCircle2 className="size-4 text-emerald-600" aria-label="confirmed" /></span> : "Not confirmed"} />
          <Row k="Identity check" v={<StatusPill status={user.kycStatus} />} />
          <Row k="Member since" v={fmtIST(user.createdAt)} />
        </div>
      </Section>

      <Section title={verified ? "Change mobile number" : "Confirm your mobile number"} description="We'll send a 6-digit code by SMS.">
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

      <Banner tone="info" title="Keep your account safe">
        Your login is protected by your Google account. Turn on 2-Step Verification in your Google settings. We will never ask for your password or codes by phone or chat.
      </Banner>
    </div>
  );
}
