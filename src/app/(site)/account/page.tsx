import { userOrLogin } from "@/server/auth/pages";
import { ApiForm } from "@/components/ApiForm";
import { Banner, Row, StatusPill } from "@/components/ui";
import { fmtIST } from "@/lib/time";

export const metadata = { title: "Account" };

export default async function Account() {
  const user = await userOrLogin();
  return (
    <div className="space-y-6">
      <h1 className="h1">Account</h1>
      <div className="card">
        <Row k="Email" v={user.email} />
        <Row k="Sign-in" v={user.firebaseUid?.startsWith("dev:") ? "Test sign-in" : "Google"} />
        <Row k="Mobile" v={user.mobile && user.mobileVerifiedAt ? `${user.mobile} (confirmed)` : "Not confirmed"} />
        <Row k="Identity check" v={<StatusPill status={user.kycStatus} />} />
        <Row k="Member since" v={fmtIST(user.createdAt)} />
      </div>
      <div className="card space-y-4">
        <h2 className="h2">{user.mobileVerifiedAt ? "Change mobile number" : "Confirm your mobile number"}</h2>
        <ApiForm action="/api/me/mobile" className="space-y-3">
          <label className="label" htmlFor="mobile">Mobile number</label>
          <div className="flex gap-2">
            <span className="input w-16 text-center">+91</span>
            <input id="mobile" name="mobile" inputMode="numeric" autoComplete="tel-national" required className="input" placeholder="98xxxxxxxx" defaultValue={user.mobile?.replace("+91", "") ?? ""} />
          </div>
          <button className="btn-secondary">Send code</button>
        </ApiForm>
        <ApiForm action="/api/me/mobile/verify" className="space-y-3">
          <label className="label" htmlFor="code">6-digit code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="input" />
          <button className="btn-primary">Confirm</button>
        </ApiForm>
      </div>
      <Banner>Security: your login is protected by your Google account. We recommend turning on 2-Step Verification in your Google account settings.</Banner>
    </div>
  );
}
