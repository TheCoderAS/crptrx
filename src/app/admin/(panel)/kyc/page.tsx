import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtIST } from "@/lib/time";
import { FilterChips, PageHeader, StatusPill } from "@/components/ui";

const AUTO_TO_REVIEW = { autoApproved: true, postReviewedAt: null, status: "APPROVED" } as const;

export default async function KycQueue({ searchParams }: { searchParams: Promise<{ all?: string; auto?: string }> }) {
  await adminOrLogin();
  const { all, auto } = await searchParams;
  const [subs, autoCount] = await Promise.all([
    prisma.kycSubmission.findMany({
      where: all ? {} : auto ? AUTO_TO_REVIEW : { status: "SUBMITTED" },
      orderBy: { submittedAt: all ? "desc" : "asc" }, // queues: oldest first
      include: { user: true },
      take: 200,
    }),
    prisma.kycSubmission.count({ where: AUTO_TO_REVIEW }),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="KYC" subtitle="Oldest first." icon={<BadgeCheck className="size-6" />} tile="tile-violet" />
      </div>
      <FilterChips
        items={[
          { href: "/admin/kyc", label: "Waiting", active: !all && !auto },
          ...(autoCount > 0 || auto ? [{ href: "/admin/kyc?auto=1", label: `Auto-approved, to check (${autoCount})`, active: !!auto }] : []),
          { href: "/admin/kyc?all=1", label: "All", active: !!all },
        ]}
      />
      {auto && <p className="muted">Approved automatically. Open each one, look at the documents, then confirm it or ask for changes.</p>}
      <div className="card overflow-x-auto">
        {subs.length === 0 ? <p className="muted">Nothing waiting.</p> : (
          <table className="table">
            <thead><tr><th>Submitted</th><th>Name</th><th>PAN</th><th>User</th><th>Status</th></tr></thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td><Link className="text-brand-700 underline" href={`/admin/kyc/${s.id}`}>{fmtIST(s.submittedAt)}</Link></td>
                  <td>{s.fullName}</td><td>{s.panMasked}</td><td>{s.user.email}</td><td><span className="inline-flex flex-wrap items-center gap-1.5"><StatusPill status={s.status} />{s.autoApproved && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">{s.postReviewedAt ? "Auto, checked" : "Auto"}</span>}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
