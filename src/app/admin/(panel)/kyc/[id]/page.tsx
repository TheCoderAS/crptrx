import { ScanFace } from "lucide-react";
import { DocPreview } from "@/components/DocPreview";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fullPan } from "@/server/kyc";
import { isSuper, pageUser } from "@/server/scope";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { BackLink, Banner, PageHeader, Row, StatusPill } from "@/components/ui";

export default async function KycDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await adminOrLogin();
  const sup = isSuper(me);
  const { id } = await params;
  const s = await prisma.kycSubmission.findUnique({ where: { id }, include: { user: true, reviewer: true } });
  if (!s) notFound();
  await pageUser(me, s.userId);
  const recommender = s.recommendedBy ? await prisma.admin.findUnique({ where: { id: s.recommendedBy }, select: { name: true } }) : null;
  // An admin who approved their own customer's check waits for a super admin; they can still ask for changes or decline.
  const waitingSuper = s.status === "SUBMITTED" && !!s.recommendedAt;
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
          {recommender && <Row k="Approved by admin" v={`${recommender.name}, ${fmtIST(s.recommendedAt)}`} />}
          {s.reviewer && <Row k="Reviewed by" v={`${s.reviewer.name}, ${fmtIST(s.reviewedAt)}`} />}
          {s.reason && <Row k="Reason" v={s.reason} />}
        </div>
        <div className="card space-y-2">
          <h2 className="h2">Documents</h2>
          <p className="muted">Opens here, on a private link valid for 5 minutes. Every view is logged with your name.</p>
          <DocPreview docs={docs.map(([k, label]) => ({ label, href: `/api/admin/kyc/${s.id}/doc?doc=${k}` }))} />
          <Banner tone="warn">Decline if the Aadhaar is NOT masked (all 12 digits visible). We must never keep a full Aadhaar number.</Banner>
        </div>
      </div>
      {needsCheck && <Banner tone="warn" title="Approved automatically">Nobody has looked at these documents yet. Check them, then confirm, or ask for changes / decline (the user can&apos;t place new orders until fixed).</Banner>}
      {waitingSuper && (
        <Banner tone={sup ? "warn" : "info"} title={sup ? "Waiting for your final approval" : "Waiting for a super admin"}>
          {sup ? `${recommender?.name ?? "An admin"} approved this. Check the documents, then approve to let the customer sell.` : "You approved this. A super admin gives the final approval before the customer can sell."}
        </Banner>
      )}
      {(s.status === "SUBMITTED" || needsCheck) && (
        <div className="card">
          <h2 className="h2">{needsCheck ? "Check" : "Decision"}</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-[auto_1fr] lg:items-start">
            <ApiForm action={`/api/admin/kyc/${s.id}`}>
              <input type="hidden" name="decision" value="APPROVED" />
              <button disabled={waitingSuper && !sup} className="btn w-full bg-emerald-600 px-6 text-white hover:brightness-110 disabled:opacity-50 lg:w-auto">{needsCheck ? "Looks good" : waitingSuper && sup ? "Final approval" : "Approve"}</button>
            </ApiForm>
            <div className="space-y-3">
              <ApiForm action={`/api/admin/kyc/${s.id}`} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-end">
                <input type="hidden" name="decision" value="NEEDS_CHANGES" />
                <div className="flex-1">
                  <label className="label" htmlFor="reason-changes">Ask for changes (user sees the reason)</label>
                  <input id="reason-changes" name="reason" required className="input" placeholder="e.g. Selfie is blurry" />
                </div>
                <button className="btn-secondary">Ask for changes</button>
              </ApiForm>
              <ApiForm action={`/api/admin/kyc/${s.id}`} confirm="Decline this identity check? The user will be blocked from placing orders." className="flex flex-col gap-2 rounded-xl bg-rose-50/60 p-3 sm:flex-row sm:items-end">
                <input type="hidden" name="decision" value="DECLINED" />
                <div className="flex-1">
                  <label className="label" htmlFor="reason-decline">Decline (blocks the user; they see the reason)</label>
                  <input id="reason-decline" name="reason" required className="input" placeholder="e.g. Not their documents" />
                </div>
                <button className="btn-danger">Decline</button>
              </ApiForm>
            </div>
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
