import Link from "next/link";
import { userOrLogin } from "@/server/auth/pages";
import { latestKyc } from "@/server/kyc";
import { ApiForm } from "@/components/ApiForm";
import { Banner, Row, StatusPill } from "@/components/ui";
import { fmtIST } from "@/lib/time";

export const metadata = { title: "Identity check" };

const FILE_HINT = "JPG, PNG or PDF, up to 5 MB";

export default async function Kyc() {
  const user = await userOrLogin();
  const sub = await latestKyc(user.id);
  const canSubmit = user.kycStatus === "NOT_STARTED" || user.kycStatus === "NEEDS_CHANGES";
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="h1">Identity check</h1>
        <StatusPill status={user.kycStatus} />
      </div>
      {!user.mobileVerifiedAt && <Banner tone="warn">First <Link className="underline" href="/account">confirm your mobile number</Link>.</Banner>}
      {user.kycStatus === "SUBMITTED" && <Banner>Submitted, under review. We usually review within 24 hours.</Banner>}
      {user.kycStatus === "APPROVED" && <Banner tone="ok">Approved. Next: <Link className="underline" href="/payout-methods">add a bank account or UPI ID</Link>.</Banner>}
      {user.kycStatus === "NEEDS_CHANGES" && <Banner tone="warn"><b>Needs changes:</b> {sub?.reason}. Fix it and submit again. Files you don&apos;t re-upload are kept.</Banner>}
      {user.kycStatus === "DECLINED" && <Banner tone="danger"><b>Declined:</b> {sub?.reason}. You can&apos;t place orders. Contact support if you think this is wrong.</Banner>}
      {sub && !canSubmit && (
        <div className="card">
          <Row k="Name" v={sub.fullName} />
          <Row k="PAN" v={sub.panMasked} />
          <Row k="Submitted" v={fmtIST(sub.submittedAt)} />
        </div>
      )}
      {canSubmit && user.mobileVerifiedAt && (
        <ApiForm action="/api/kyc" className="card space-y-4">
          <div>
            <label className="label" htmlFor="fullName">Full name exactly as on PAN</label>
            <input id="fullName" name="fullName" required className="input" defaultValue={sub?.fullName} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="dob">Date of birth</label>
              <input id="dob" name="dob" type="date" required className="input" defaultValue={sub?.dob} />
            </div>
            <div>
              <label className="label" htmlFor="pan">PAN number</label>
              <input id="pan" name="pan" required className="input uppercase" maxLength={10} placeholder="ABCDE1234F" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="address">Residential address</label>
            <textarea id="address" name="address" required rows={3} className="input" defaultValue={sub?.address} />
          </div>
          <Banner tone="warn">
            Upload the <b>masked Aadhaar</b> only (first 8 digits hidden, e.g. XXXX XXXX 1234). You can download it from the UIDAI website. Never type or upload your full Aadhaar number. We will decline unmasked copies.
          </Banner>
          {[
            ["panDoc", "Photo of your PAN card"],
            ["aadhaarFront", "Masked Aadhaar: front"],
            ["aadhaarBack", "Masked Aadhaar: back"],
            ["selfie", "Selfie holding your PAN card"],
          ].map(([name, label]) => (
            <div key={name}>
              <label className="label" htmlFor={name}>{label}</label>
              <input id={name} name={name} type="file" accept="image/jpeg,image/png,application/pdf" required={!sub} className="block w-full text-sm" />
              <p className="muted mt-1">{FILE_HINT}</p>
            </div>
          ))}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="maskedConfirmed" required className="mt-1" />
            <span>I confirm the Aadhaar I uploaded is masked (first 8 digits hidden).</span>
          </label>
          <button className="btn-primary w-full">Submit for review</button>
        </ApiForm>
      )}
    </div>
  );
}
