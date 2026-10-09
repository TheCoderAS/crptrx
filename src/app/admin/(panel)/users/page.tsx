import Link from "next/link";
import { UserRound } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { userScope } from "@/server/scope";
import { fmtISTShort } from "@/lib/time";
import { pickSort } from "@/lib/sort";
import { ListToolbar } from "@/components/ListToolbar";
import { EmptyState, PageHeader, StatusPill } from "@/components/ui";

const PER_PAGE = 50;
const SORTS = [
  { value: "new", label: "Newest first" },
  { value: "old", label: "Oldest first" },
  { value: "email", label: "Email A–Z" },
  { value: "orders", label: "Most orders" },
] as const;
type Sort = (typeof SORTS)[number]["value"];
const ORDER_BY: Record<Sort, Prisma.UserOrderByWithRelationInput> = { new: { createdAt: "desc" }, old: { createdAt: "asc" }, email: { email: "asc" }, orders: { orders: { _count: "desc" } } };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; sort?: string; admin?: string }> }) {
  const me = await adminOrLogin();
  const sup = me.role === "SUPER_ADMIN";
  const { q, page, sort: sortParam, admin: adminParam } = await searchParams;
  const sort = pickSort(sortParam, SORTS.map((s) => s.value), "new");
  const term = q?.trim();
  const where: Prisma.UserWhereInput = term
    ? { OR: [{ email: { contains: term, mode: "insensitive" } }, { mobile: { contains: term.replace(/\s/g, "") } }, { displayName: { contains: term, mode: "insensitive" } }, { id: term }, { kycSubmissions: { some: { fullName: { contains: term, mode: "insensitive" } } } }] }
    : {};
  // Super admin: ?admin=<id> shows one admin's customers, ?admin=house those without an admin.
  const byAdmin = sup && adminParam ? (adminParam === "house" ? null : adminParam) : undefined;
  if (byAdmin !== undefined) where.adminId = byAdmin;
  Object.assign(where, userScope(me)); // an admin sees only their own customers
  const pageNo = Math.max(1, Number(page) || 1);
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: [ORDER_BY[sort], { createdAt: "desc" }], skip: (pageNo - 1) * PER_PAGE, take: PER_PAGE, include: { _count: { select: { orders: true } }, admin: { select: { name: true } } } }),
    prisma.user.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (n: number) => `/admin/users?${new URLSearchParams({ ...(term ? { q: term } : {}), ...(sort !== "new" ? { sort } : {}), ...(byAdmin !== undefined ? { admin: adminParam! } : {}), page: String(n) })}`;
  const filteredAdmin = byAdmin ? await prisma.admin.findUnique({ where: { id: byAdmin }, select: { name: true } }) : null;
  return (
    <div className="space-y-4">
      <PageHeader title="Customers" subtitle={`${total} ${total === 1 ? "account" : "accounts"}${byAdmin === null ? " without an admin" : filteredAdmin ? ` of ${filteredAdmin.name}` : ""}.`} icon={<UserRound className="size-6" />} tile="tile-blue" />
      <ListToolbar placeholder="Email, mobile, name on ID" sorts={[...SORTS]} defaultSort="new" />
      <div className="card overflow-hidden p-0 sm:p-0">
        {users.length === 0 ? (
          <EmptyState icon={<UserRound className="size-6" />} title="No customers found">{term ? "Try part of the email or the mobile number." : "Sign-ups will appear here."}</EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {users.map((u) => (
                <li key={u.id}>
                  <Link href={`/admin/users/${u.id}`} className="block space-y-1 px-4 py-3 active:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium text-slate-900">{u.email}</span>
                      <StatusPill status={u.kycStatus} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{sup ? `${u.admin?.name ?? "No admin"} · ` : ""}{u.mobile ?? "No mobile"} · {u._count.orders} {u._count.orders === 1 ? "order" : "orders"}{u.status !== "ACTIVE" ? ` · ${u.status.toLowerCase()}` : ""}</span>
                      <span className="shrink-0">{fmtISTShort(u.createdAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="table">
                <thead><tr><th>Email</th><th>Mobile</th><th>KYC</th><th className="text-right">Orders</th><th>Account</th>{sup && <th>Admin</th>}<th>Joined</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="relative hover:bg-slate-50">
                      <td className="max-w-64 truncate"><Link className="font-medium text-brand-700 after:absolute after:inset-0" href={`/admin/users/${u.id}`}>{u.email}</Link></td>
                      <td className="whitespace-nowrap text-slate-600">{u.mobile ?? "—"}</td>
                      <td><StatusPill status={u.kycStatus} /></td>
                      <td className="text-right">{u._count.orders}</td>
                      <td><StatusPill status={u.status} /></td>
                      {sup && <td className="max-w-40 truncate text-sm text-slate-600">{u.admin?.name ?? "—"}</td>}
                      <td className="whitespace-nowrap text-xs text-slate-500">{fmtISTShort(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
