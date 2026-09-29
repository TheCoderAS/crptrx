import { Landmark } from "lucide-react";
import Link from "next/link";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { decrypt } from "@/server/crypto";
import { namesMatch } from "@/server/payouts";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { PageHeader, StatusPill } from "@/components/ui";

export default async function PayoutQueue() {
  await adminOrLogin();
  const pms = await prisma.payoutMethod.findMany({ where: { status: "PENDING", deletedAt: null }, orderBy: { createdAt: "asc" }, include: { user: true } });
  const kycs = await prisma.kycSubmission.findMany({ where: { userId: { in: pms.map((p) => p.userId) }, status: "APPROVED" }, orderBy: { reviewedAt: "desc" } });
  const kycName = (uid: string) => kycs.find((k) => k.userId === uid)?.fullName ?? null;
  return (
    <div className="space-y-4">
      <PageHeader title="Payout methods" subtitle="Check the holder name matches the KYC name." icon={<Landmark className="size-6" />} tile="tile-emerald" />
      {pms.length === 0 && <p className="muted">Nothing waiting.</p>}
      {pms.map((p) => {
        const kn = kycName(p.userId);
        const match = kn ? namesMatch(kn, p.holderName) : false;
        return (
          <div key={p.id} className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{p.type === "BANK" ? "Bank account" : "UPI"} · {p.user.email}</p>
              <StatusPill status={p.status} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className={`rounded-lg p-3 ${match ? "bg-green-50" : kn ? "bg-red-50 ring-2 ring-red-400" : "bg-amber-50 ring-1 ring-amber-300"}`}>
                <p className="muted">KYC name</p><p className="font-semibold">{kn ?? "No identity check on file"}</p>
                <p className="muted mt-2">Holder name</p><p className="font-semibold">{p.holderName}</p>
                {kn && !match && <p className="mt-2 text-sm font-semibold text-red-700">Names differ. Check carefully before approving.</p>}
                {!kn && <p className="mt-2 text-sm font-semibold text-amber-800">Identity checks are off, so there&apos;s no verified name to compare. Check the account belongs to the user (e.g. email or mobile) before approving.</p>}
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                {p.type === "BANK" ? <><p>A/c: <b>{p.accountNumberEncrypted ? decrypt(p.accountNumberEncrypted) : "—"}</b></p><p>IFSC: <b>{p.ifsc}</b></p></> : <p>UPI: <b>{p.upiId}</b></p>}
                <p className="muted mt-2">Added {fmtIST(p.createdAt)} · <Link className="underline" href={`/admin/users/${p.userId}`}>user</Link></p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <ApiForm action={`/api/admin/payout-methods/${p.id}`}><input type="hidden" name="decision" value="APPROVED" /><button className="btn-primary">Approve</button></ApiForm>
              <ApiForm action={`/api/admin/payout-methods/${p.id}`} className="flex gap-2" outerClassName="flex-1">
                <input type="hidden" name="decision" value="DECLINED" />
                <input name="reason" required className="input" placeholder="Reason, e.g. Name doesn't match your PAN" />
                <button className="btn-danger">Decline</button>
              </ApiForm>
            </div>
          </div>
        );
      })}
    </div>
  );
}
