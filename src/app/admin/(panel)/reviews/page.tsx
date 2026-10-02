import Link from "next/link";
import { CheckCircle2, ClipboardCheck, TriangleAlert } from "lucide-react";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { decrypt } from "@/server/crypto";
import { namesMatch } from "@/server/payouts";
import type { Prisma } from "@prisma/client";
import { fmtIST } from "@/lib/time";
import { pickSort } from "@/lib/sort";
import { ListToolbar } from "@/components/ListToolbar";
import { ApiForm } from "@/components/ApiForm";
import { EmptyState, PageHeader, StatusPill } from "@/components/ui";

// One place for everything that needs a person to look at it before a customer can sell.
const AUTO_TO_CHECK = { autoApproved: true, postReviewedAt: null, status: "APPROVED" } as const;
type Tab = "kyc" | "payout" | "auto" | "history";
const SORTS = [
  { value: "old", label: "Oldest first" },
  { value: "new", label: "Newest first" },
  { value: "name", label: "Name A–Z" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

export default async function Reviews({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; sort?: string }> }) {
  await adminOrLogin();
  const [kycCount, payoutCount, autoCount] = await Promise.all([
    prisma.kycSubmission.count({ where: { status: "SUBMITTED" } }),
    prisma.payoutMethod.count({ where: { status: "PENDING", deletedAt: null } }),
    prisma.kycSubmission.count({ where: AUTO_TO_CHECK }),
  ]);
  const sp = await searchParams;
  const requested = sp.tab as Tab | undefined;
  // Open the first tab that has work in it.
  const tab: Tab = requested ?? (kycCount ? "kyc" : payoutCount ? "payout" : autoCount ? "auto" : "kyc");
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "kyc", label: "Identity", count: kycCount },
    { id: "payout", label: "Bank & UPI", count: payoutCount },
    { id: "auto", label: "Auto-approved", count: autoCount },
    { id: "history", label: "History" },
  ];
  const defaultSort: Sort = tab === "history" ? "new" : "old";
  const sort = pickSort(sp.sort, SORTS.map((s) => s.value), defaultSort);
  const q = sp.q?.trim() || undefined;

  return (
    <div className="space-y-4">
      <PageHeader title="Reviews" subtitle="Everything waiting for a person to check." icon={<ClipboardCheck className="size-5" />} tile="tile-violet" />
      <nav className="flex gap-1 border-b border-slate-200" aria-label="Review queues">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/admin/reviews?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}
          >
            {t.label}
            {!!t.count && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-amber-950 tabular-nums">{t.count}</span>}
          </Link>
        ))}
      </nav>
      <ListToolbar placeholder={tab === "payout" ? "Email, name, account no., IFSC or UPI ID" : "Name, email or PAN"} sorts={[...SORTS]} defaultSort={defaultSort} />
      {tab === "payout" ? <PayoutQueue q={q} sort={sort} /> : <KycQueue mode={tab} q={q} sort={sort} />}
    </div>
  );
}

async function KycQueue({ mode, q, sort }: { mode: "kyc" | "auto" | "history"; q?: string; sort: Sort }) {
  const search: Prisma.KycSubmissionWhereInput = q
    ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }, { panMasked: { contains: q.toUpperCase() } }] }
    : {};
  const subs = await prisma.kycSubmission.findMany({
    where: { ...(mode === "kyc" ? { status: "SUBMITTED" as const } : mode === "auto" ? AUTO_TO_CHECK : {}), ...search },
    orderBy: sort === "name" ? [{ fullName: "asc" }, { submittedAt: "asc" }] : { submittedAt: sort === "new" ? "desc" : "asc" },
    include: { user: true },
    take: 200,
  });
  if (subs.length === 0) return q ? <EmptyState icon={<CheckCircle2 className="size-6" />} title="No matches">Nothing here matches “{q}”.</EmptyState> : <EmptyState icon={<CheckCircle2 className="size-6" />} title="All clear">Nothing waiting here.</EmptyState>;
  return (
    <div className="card overflow-x-auto p-0 sm:p-0">
      {mode === "auto" && <p className="border-b border-slate-100 px-4 py-2.5 text-sm text-slate-500">Approved automatically. Open each, check the documents, then confirm or ask for changes.</p>}
      <table className="table">
        <thead><tr><th>Name</th><th>PAN</th><th>Customer</th><th>Submitted</th><th>Status</th></tr></thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id}>
              <td><Link className="font-medium text-brand-700 hover:underline" href={`/admin/kyc/${s.id}`}>{s.fullName}</Link></td>
              <td className="font-mono text-xs">{s.panMasked}</td>
              <td className="text-slate-600">{s.user.email}</td>
              <td className="whitespace-nowrap text-slate-500">{fmtIST(s.submittedAt)}</td>
              <td>
                <span className="inline-flex items-center gap-1.5">
                  <StatusPill status={s.status} />
                  {s.autoApproved && <span className="rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{s.postReviewedAt ? "Auto · checked" : "Auto"}</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function PayoutQueue({ q, sort }: { q?: string; sort: Sort }) {
  // Account numbers are encrypted, so they're matched on the last 4 digits.
  const search: Prisma.PayoutMethodWhereInput = q
    ? {
        OR: [
          { holderName: { contains: q, mode: "insensitive" } },
          { user: { email: { contains: q, mode: "insensitive" } } },
          { upiId: { contains: q, mode: "insensitive" } },
          { ifsc: { contains: q.toUpperCase() } },
          ...(/^\d{4,}$/.test(q) ? [{ accountLast4: q.slice(-4) }] : []),
        ],
      }
    : {};
  const pms = await prisma.payoutMethod.findMany({
    where: { status: "PENDING", deletedAt: null, ...search },
    orderBy: sort === "name" ? [{ holderName: "asc" }, { createdAt: "asc" }] : { createdAt: sort === "new" ? "desc" : "asc" },
    include: { user: true },
  });
  if (pms.length === 0) return <EmptyState icon={<CheckCircle2 className="size-6" />} title={q ? "No matches" : "All clear"}>{q ? `Nothing here matches “${q}”.` : "No bank accounts or UPI IDs waiting."}</EmptyState>;
  const kycs = await prisma.kycSubmission.findMany({ where: { userId: { in: pms.map((p) => p.userId) }, status: "APPROVED" }, orderBy: { reviewedAt: "desc" } });
  const kycName = (uid: string) => kycs.find((k) => k.userId === uid)?.fullName ?? null;
  return (
    <div className="space-y-2">
      {pms.map((p) => {
        const kn = kycName(p.userId);
        const match = kn ? namesMatch(kn, p.holderName) : false;
        return (
          <div key={p.id} className="card grid gap-3 p-4 sm:p-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-900">{p.type === "BANK" ? "Bank account" : "UPI"}</span>
                <Link className="truncate text-brand-700 hover:underline" href={`/admin/users/${p.userId}`}>{p.user.email}</Link>
                <span className="text-xs text-slate-400">{fmtIST(p.createdAt)}</span>
              </p>
              <p className="mt-1 font-mono text-sm text-slate-700">
                {p.type === "BANK" ? <>{p.accountNumberEncrypted ? decrypt(p.accountNumberEncrypted) : "—"} · {p.ifsc}</> : p.upiId}
              </p>
            </div>
            <div className={`rounded-lg px-3 py-2 text-sm ${!kn ? "bg-amber-50 text-amber-900" : match ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
              <p className="flex items-center gap-1.5 font-medium">
                {match ? <CheckCircle2 className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
                {p.holderName}
              </p>
              <p className="text-xs opacity-80">{kn ? (match ? `Matches ID: ${kn}` : `ID says: ${kn}`) : "No identity check on file"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <ApiForm action={`/api/admin/payout-methods/${p.id}`} confirm={match ? undefined : "The names don't match. Approve anyway?"}>
                <input type="hidden" name="decision" value="APPROVED" />
                <button className="btn-primary px-3 py-2">Approve</button>
              </ApiForm>
              <ApiForm action={`/api/admin/payout-methods/${p.id}`} className="flex gap-2">
                <input type="hidden" name="decision" value="DECLINED" />
                <input name="reason" required aria-label="Reason for declining" className="input w-44 py-2 text-sm" placeholder="Reason to decline" />
                <button className="btn-secondary px-3 py-2 text-rose-600">Decline</button>
              </ApiForm>
            </div>
          </div>
        );
      })}
    </div>
  );
}
