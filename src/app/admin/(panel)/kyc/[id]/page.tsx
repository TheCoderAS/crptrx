import { Ban, CheckCircle2, PencilLine, ScanFace } from "lucide-react";
import { InfoTip } from "@/components/InfoTip";
import { DocPreview } from "@/components/DocPreview";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fullPan } from "@/server/kyc";
import { pageUser } from "@/server/scope";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { BackLink, Banner, PageHeader, Row, StatusPill } from "@/components/ui";

export default async function KycDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await adminOrLogin();
  const { id } = await params;
  const s = await prisma.kycSubmission.findUnique({ where: { id }, include: { user: true, reviewer: true } });
  if (!s) notFound();
  await pageUser(me, s.userId);
  const history = await prisma.kycSubmission.findMany({ where: { userId: s.userId, id: { not: s.id } }, orderBy: { submittedAt: "desc" } });
  const postReviewer = s.postReviewedBy ? await prisma.admin.findUnique({ where: { id: s.postReviewedBy } }) : null;
  const needsCheck = s.status === "APPROVED" && s.autoApproved && !s.postReviewedAt;
  const docs = [["panDoc", "PAN card"], ["aadhaarFront", "Masked Aadhaar front"], ["aadhaarBack", "Masked Aadhaar back"], ["selfie", "Selfie with PAN"]];
  return (
    <div className="space-y-4">
      <BackLink href="/admin/reviews">Reviews</BackLink>
      <PageHeader title={s.fullName} icon={<ScanFace className="size-6" />} tile="tile-violet" action={<StatusPill status={s.status} />} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <Row k="Email" v={s.user.email} />
          <Row k="Mobile" v={s.user.mobile ?? "—"} />
          <Row k="Date of birth" v={s.dob} />
          <Row k="PAN" v={fullPan(s.panEncrypted)} />
          <Row k="Address" v={s.address} />
          <Row k="Submitted" v={fmtIST(s.submittedAt)} />
          <Row k="User account" v={<Link className="underline" href={`/admin/users/${s.userId}`}>{s.user.status}</Link>} />
          {s.autoApproved && <Row k="Approved" v={`Automatically, ${fmtIST(s.reviewedAt)}`} />}
          {postReviewer && <Row k="Checked by" v={`${postReviewer.name}, ${fmtIST(s.postReviewedAt)}`} />}
          {s.reviewer && <Row k="Reviewed by" v={`${s.reviewer.name}, ${fmtIST(s.reviewedAt)}`} />}
          {s.reason && <Row k="Reason" v={s.reason} />}
        </div>
        <div className="card space-y-2">
          <h2 className="h2 flex items-center gap-1.5">
            Documents
            <InfoTip>Opens here, on a private link valid for 5 minutes. Every view is logged with your name.</InfoTip>
            <InfoTip tone="warn">Decline if the Aadhaar is NOT masked (all 12 digits visible). We must never keep a full Aadhaar number.</InfoTip>
          </h2>
          <DocPreview docs={docs.map(([k, label]) => ({ label, href: `/api/admin/kyc/${s.id}/doc?doc=${k}` }))} />
        </div>
      </div>
      {needsCheck && <Banner tone="warn" title="Approved automatically">Nobody has looked at these documents yet. Check them, then confirm, or ask for changes / decline (the user can&apos;t place new orders until fixed).</Banner>}
      {(s.status === "SUBMITTED" || needsCheck) && (
        <div className="card space-y-4">
          <h2 className="h2">{needsCheck ? "Check" : "Decision"}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <ApiForm action={`/api/admin/kyc/${s.id}`} className="flex h-full flex-col justify-between gap-3 rounded-xl p-4 ring-1 ring-emerald-500/30">
              <div>
                <p className="flex items-center gap-1.5 font-semibold text-emerald-700"><CheckCircle2 className="size-4" aria-hidden /> {needsCheck ? "Looks good" : "Approve"}</p>
                <p className="mt-1 text-xs text-slate-500">{needsCheck ? "Marks these documents as checked." : "The user can start selling."}</p>
              </div>
              <input type="hidden" name="decision" value="APPROVED" />
              <button className="btn w-full bg-emerald-600 text-white hover:brightness-110">{needsCheck ? "Looks good" : "Approve"}</button>
            </ApiForm>
            <ApiForm action={`/api/admin/kyc/${s.id}`} className="flex h-full flex-col justify-between gap-3 rounded-xl p-4 ring-1 ring-amber-500/30">
              <div>
                <label className="flex items-center gap-1.5 font-semibold text-amber-700" htmlFor="reason-changes"><PencilLine className="size-4" aria-hidden /> Ask for changes</label>
                <p className="mt-1 mb-2 text-xs text-slate-500">The user sees the reason and sends again.</p>
                <input id="reason-changes" name="reason" required className="input" placeholder="e.g. Selfie is blurry" />
              </div>
              <input type="hidden" name="decision" value="NEEDS_CHANGES" />
              <button className="btn-secondary w-full">Ask for changes</button>
            </ApiForm>
            <ApiForm action={`/api/admin/kyc/${s.id}`} confirm="Decline this identity check? The user will be blocked from placing orders." className="flex h-full flex-col justify-between gap-3 rounded-xl p-4 ring-1 ring-rose-500/30">
              <div>
                <label className="flex items-center gap-1.5 font-semibold text-rose-700" htmlFor="reason-decline"><Ban className="size-4" aria-hidden /> Decline</label>
                <p className="mt-1 mb-2 text-xs text-slate-500">Blocks the user. They see the reason.</p>
                <input id="reason-decline" name="reason" required className="input" placeholder="e.g. Not their documents" />
              </div>
              <input type="hidden" name="decision" value="DECLINED" />
              <button className="btn-danger w-full">Decline</button>
            </ApiForm>
          </div>
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
