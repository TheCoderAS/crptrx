import Link from "next/link";
import { notFound } from "next/navigation";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fullPan } from "@/server/kyc";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { Banner, Row, StatusPill } from "@/components/ui";

export default async function KycDetail({ params }: { params: Promise<{ id: string }> }) {
  await adminOrLogin();
  const { id } = await params;
  const s = await prisma.kycSubmission.findUnique({ where: { id }, include: { user: true, reviewer: true } });
  if (!s) notFound();
  const history = await prisma.kycSubmission.findMany({ where: { userId: s.userId, id: { not: s.id } }, orderBy: { submittedAt: "desc" } });
  const docs = [["panDoc", "PAN card"], ["aadhaarFront", "Masked Aadhaar front"], ["aadhaarBack", "Masked Aadhaar back"], ["selfie", "Selfie with PAN"]];
  return (
    <div className="space-y-4">
      <Link href="/admin/kyc" className="text-sm underline">← KYC queue</Link>
      <div className="flex items-center gap-3"><h1 className="h1">{s.fullName}</h1><StatusPill status={s.status} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <Row k="Email" v={s.user.email} />
          <Row k="Mobile" v={s.user.mobile ?? "—"} />
          <Row k="Date of birth" v={s.dob} />
          <Row k="PAN" v={fullPan(s.panEncrypted)} />
          <Row k="Address" v={s.address} />
          <Row k="Submitted" v={fmtIST(s.submittedAt)} />
          <Row k="User account" v={<Link className="underline" href={`/admin/users/${s.userId}`}>{s.user.status}</Link>} />
          {s.reviewer && <Row k="Reviewed by" v={`${s.reviewer.name}, ${fmtIST(s.reviewedAt)}`} />}
          {s.reason && <Row k="Reason" v={s.reason} />}
        </div>
        <div className="card space-y-2">
          <h2 className="h2">Documents</h2>
          <p className="muted">Each opens a private link valid for 5 minutes. Every view is logged with your name.</p>
          {docs.map(([k, label]) => (
            <a key={k} href={`/api/admin/kyc/${s.id}/doc?doc=${k}`} target="_blank" rel="noreferrer" className="btn-secondary w-full justify-start">{label}</a>
          ))}
          <Banner tone="warn">Decline if the Aadhaar is NOT masked (all 12 digits visible). We must never keep a full Aadhaar number.</Banner>
        </div>
      </div>
      {s.status === "SUBMITTED" && (
        <div className="card space-y-3">
          <h2 className="h2">Decision</h2>
          <ApiForm action={`/api/admin/kyc/${s.id}`} className="space-y-3">
            <input type="hidden" name="decision" value="APPROVED" />
            <button className="btn-primary">Approve</button>
          </ApiForm>
          <ApiForm action={`/api/admin/kyc/${s.id}`} className="space-y-2">
            <select name="decision" className="input w-auto"><option value="NEEDS_CHANGES">Needs changes</option><option value="DECLINED">Decline</option></select>
            <input name="reason" required className="input" placeholder="Reason shown to the user, e.g. Selfie is blurry" />
            <button className="btn-danger">Send</button>
          </ApiForm>
        </div>
      )}
      {history.length > 0 && (
        <div className="card">
          <h2 className="h2 mb-2">Earlier submissions</h2>
          {history.map((h) => <p key={h.id} className="text-sm"><Link className="underline" href={`/admin/kyc/${h.id}`}>{fmtIST(h.submittedAt)}</Link> · {h.status} {h.reason ? `· ${h.reason}` : ""}</p>)}
        </div>
      )}
    </div>
  );
}
