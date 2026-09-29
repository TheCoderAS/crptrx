import Link from "next/link";
import { BadgeCheck, Clock3, ScanFace, ShieldX, TriangleAlert } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { latestKyc } from "@/server/kyc";
import { ApiForm } from "@/components/ApiForm";
import { FileTile } from "@/components/FileTile";
import { Banner, PageHeader, Row, Section, StatusPill } from "@/components/ui";
import { fmtIST } from "@/lib/time";

export const metadata = { title: "Identity check", robots: { index: false, follow: false } };

export default async function Kyc() {
  const user = await userOrLogin();
  const sub = await latestKyc(user.id);
  const canSubmit = user.kycStatus === "NOT_STARTED" || user.kycStatus === "NEEDS_CHANGES";
  const state = {
    SUBMITTED: { icon: Clock3, tone: "tile-blue", title: "Submitted, under review", body: "We usually review within 24 hours. We'll email you when it's done." },
    APPROVED: { icon: BadgeCheck, tone: "tile-emerald", title: "You're verified", body: "Next, add the bank account or UPI ID you want to be paid to." },
    NEEDS_CHANGES: { icon: TriangleAlert, tone: "tile-amber", title: "We need a small change", body: sub?.reason ?? "" },
    DECLINED: { icon: ShieldX, tone: "tile-rose", title: "Your identity check was declined", body: `${sub?.reason ?? ""} You can't place orders. Contact support if you think this is wrong.` },
    NOT_STARTED: null,
  }[user.kycStatus];

  return (
    <div className="space-y-6">
      <PageHeader title="Identity check" subtitle="Required by law. About 3 minutes." icon={<ScanFace className="size-6" />} tile="tile-violet" action={<StatusPill status={user.kycStatus} />} />

      {!user.mobileVerifiedAt && <Banner tone="warn">First <Link className="font-medium underline" href="/account">confirm your mobile number</Link>.</Banner>}

      {state && (
        <div className="card flex gap-4">
          <span className={`icon-tile ${state.tone}`}><state.icon className="size-5" aria-hidden /></span>
          <div>
            <p className="font-semibold text-slate-900">{state.title}</p>
            <p className="mt-0.5 text-sm text-slate-600">{state.body}</p>
            {user.kycStatus === "APPROVED" && <Link href="/payout-methods" className="btn-primary mt-3">Add bank or UPI</Link>}
          </div>
        </div>
      )}

      {sub && !canSubmit && (
        <Section title="What you submitted">
          <div className="divide-y divide-slate-100">
            <Row k="Name" v={sub.fullName} />
            <Row k="PAN" v={sub.panMasked} />
            <Row k="Submitted" v={fmtIST(sub.submittedAt)} />
          </div>
        </Section>
      )}

      {canSubmit && user.mobileVerifiedAt && (
        <ApiForm action="/api/kyc" className="space-y-6">
          <Section title="Personal details" description="Exactly as printed on your PAN card.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="fullName">Full name</label>
                <input id="fullName" name="fullName" required autoComplete="name" className="input" defaultValue={sub?.fullName} />
              </div>
              <div>
                <label className="label" htmlFor="dob">Date of birth</label>
                <input id="dob" name="dob" type="date" required className="input" defaultValue={sub?.dob} />
              </div>
              <div>
                <label className="label" htmlFor="pan">PAN</label>
                <input id="pan" name="pan" required className="input font-mono uppercase" maxLength={10} placeholder="ABCDE1234F" autoComplete="off" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="address">Residential address</label>
                <textarea id="address" name="address" required rows={3} autoComplete="street-address" className="input" defaultValue={sub?.address} />
              </div>
            </div>
          </Section>

          <Section title="Documents" description="Clear photos in good light. All four are required.">
            <Banner tone="warn" title="Upload only the masked Aadhaar">
              First 8 digits hidden (XXXX XXXX 1234). Get it free from the UIDAI website. Unmasked copies are declined.
            </Banner>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <FileTile name="panDoc" label="PAN card" required={!sub} keptNote={sub ? "Kept from before; tap to replace" : undefined} />
              <FileTile name="selfie" label="Selfie holding PAN" required={!sub} keptNote={sub ? "Kept from before; tap to replace" : undefined} />
              <FileTile name="aadhaarFront" label="Masked Aadhaar: front" required={!sub} keptNote={sub ? "Kept from before; tap to replace" : undefined} />
              <FileTile name="aadhaarBack" label="Masked Aadhaar: back" required={!sub} keptNote={sub ? "Kept from before; tap to replace" : undefined} />
            </div>
          </Section>

          <div className="card space-y-4">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" name="maskedConfirmed" required className="mt-0.5 size-4 rounded border-slate-300 accent-brand-600" />
              <span>I confirm the Aadhaar I uploaded is masked, and these documents are mine.</span>
            </label>
            <button className="btn-primary btn-lg w-full">Submit for review</button>
            <p className="text-center text-xs text-slate-500">Your documents are stored privately and only our compliance team can open them. Every view is logged.</p>
          </div>
        </ApiForm>
      )}
    </div>
  );
}
