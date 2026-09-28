import Link from "next/link";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtIST } from "@/lib/time";
import { StatusPill } from "@/components/ui";

export default async function KycQueue({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  await adminOrLogin();
  const { all } = await searchParams;
  const subs = await prisma.kycSubmission.findMany({
    where: all ? {} : { status: "SUBMITTED" },
    orderBy: { submittedAt: all ? "desc" : "asc" }, // queue: oldest first
    include: { user: true },
    take: 200,
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">KYC {all ? "(all)" : "queue"}</h1>
        <Link className="text-sm underline" href={all ? "/admin/kyc" : "/admin/kyc?all=1"}>{all ? "Show waiting only" : "Show all"}</Link>
      </div>
      <div className="card overflow-x-auto">
        {subs.length === 0 ? <p className="muted">Nothing waiting.</p> : (
          <table className="table">
            <thead><tr><th>Submitted</th><th>Name</th><th>PAN</th><th>User</th><th>Status</th></tr></thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td><Link className="text-brand-700 underline" href={`/admin/kyc/${s.id}`}>{fmtIST(s.submittedAt)}</Link></td>
                  <td>{s.fullName}</td><td>{s.panMasked}</td><td>{s.user.email}</td><td><StatusPill status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
