import Link from "next/link";
import { UserRound } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtIST } from "@/lib/time";
import { EmptyState, PageHeader, StatusPill } from "@/components/ui";

const PER_PAGE = 50;

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await adminOrLogin();
  const { q, page } = await searchParams;
  const term = q?.trim();
  const where: Prisma.UserWhereInput = term
    ? { OR: [{ email: { contains: term, mode: "insensitive" } }, { mobile: { contains: term.replace(/\s/g, "") } }, { displayName: { contains: term, mode: "insensitive" } }, { id: term }, { kycSubmissions: { some: { fullName: { contains: term, mode: "insensitive" } } } }] }
    : {};
  const pageNo = Math.max(1, Number(page) || 1);
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (pageNo - 1) * PER_PAGE, take: PER_PAGE, include: { _count: { select: { orders: true } } } }),
    prisma.user.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (n: number) => `/admin/users?${new URLSearchParams({ ...(term ? { q: term } : {}), page: String(n) })}`;
  return (
    <div className="space-y-4">
      <PageHeader title="Customers" subtitle={`${total} ${total === 1 ? "account" : "accounts"}, newest first.`} icon={<UserRound className="size-6" />} tile="tile-blue" />
      <form className="flex gap-2">
        <input name="q" defaultValue={term} aria-label="Search customers" className="input max-w-md" placeholder="Email, mobile, name on ID" />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card overflow-x-auto">
        {users.length === 0 ? (
          <EmptyState icon={<UserRound className="size-6" />} title="No customers found">{term ? "Try part of the email or the mobile number." : "Sign-ups will appear here."}</EmptyState>
        ) : (
          <table className="table">
            <thead><tr><th>Email</th><th>Mobile</th><th>KYC</th><th>Orders</th><th>Account</th><th>Joined</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><Link className="font-medium text-brand-700 underline" href={`/admin/users/${u.id}`}>{u.email}</Link></td>
                  <td className="whitespace-nowrap">{u.mobile ?? "—"}</td>
                  <td><StatusPill status={u.kycStatus} /></td>
                  <td>{u._count.orders}</td>
                  <td><StatusPill status={u.status} /></td>
                  <td className="whitespace-nowrap">{fmtIST(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pages">
          {pageNo > 1 ? <Link href={href(pageNo - 1)} className="btn-secondary">Previous</Link> : <span />}
          <span className="muted">Page {pageNo} of {pages}</span>
          {pageNo < pages ? <Link href={href(pageNo + 1)} className="btn-secondary">Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
