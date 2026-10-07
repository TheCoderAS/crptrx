import { UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { pageUser } from "@/server/scope";
import { D, fmtInr, fmtUsdt } from "@/server/money";
import { maskedPayout } from "@/server/payouts";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { Select } from "@/components/Select";
import { BackLink, NetworkBadge, PageHeader, Row, StatusPill } from "@/components/ui";

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await adminOrLogin();
  const sup = me.role === "SUPER_ADMIN";
  const { id } = await params;
  const u = await prisma.user.findUnique({ where: { id }, include: { admin: { select: { id: true, name: true } }, kycSubmissions: { orderBy: { submittedAt: "desc" } }, payoutMethods: true, wallets: { orderBy: { createdAt: "asc" } }, orders: { orderBy: { createdAt: "desc" }, take: 50 } } });
  if (!u) notFound();
  await pageUser(me, u.id);
  const admins = sup ? await prisma.admin.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true, name: true, inviteCode: true }, orderBy: { name: "asc" } }) : [];
  return (
    <div className="space-y-4">
      <BackLink href="/admin/users">Customers</BackLink>
      <PageHeader title={<span className="break-all">{u.email}</span>} icon={<UserRound className="size-6" />} />
      <div className="card">
        <Row k="Status" v={<StatusPill status={u.status} />} />
        <Row k="Mobile" v={u.mobile ?? "—"} />
        <Row k="Sign-in" v={[u.firebaseUid && !u.firebaseUid.startsWith("dev:") && "Google", u.passwordHash && "Password", u.firebaseUid?.startsWith("dev:") && "Test"].filter(Boolean).join(", ") || "—"} />
        <Row k="Email confirmed" v={u.emailVerified ? "Yes" : "No"} />
        {u.lockedUntil && u.lockedUntil > new Date() && <Row k="Password locked until" v={fmtIST(u.lockedUntil)} />}
        <Row k="KYC" v={<StatusPill status={u.kycStatus} />} />
        <Row k="Joined" v={fmtIST(u.createdAt)} />
        <Row k="Bonus on orders" v={D(u.rewardPercent).gt(0) ? `${D(u.rewardPercent).toString()}% of ${u.adminId ? "the admin's" : "your"} margin share` : "None"} />
        {sup && <Row k="Admin" v={u.admin ? `${u.admin.name}${u.referredAt ? ` · since ${fmtIST(u.referredAt)}` : ""}` : "None (yours)"} />}
      </div>
      <ApiForm action={`/api/admin/users/${u.id}/reward`} className="card flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="reward">Bonus reward (% of {u.adminId ? (sup ? "the admin's" : "your") : "your"} share)</label>
          <div className="relative">
            <input id="reward" name="rewardPercent" defaultValue={D(u.rewardPercent).toString()} inputMode="decimal" className="input pr-10" />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">%</span>
          </div>
          <p className="hint">The customer gets this part of the share on each order. 0 = none.</p>
        </div>
        <button className="btn-secondary">Save bonus</button>
      </ApiForm>
      {sup && (
        <ApiForm action={`/api/admin/users/${u.id}/admin`} className="card grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end" confirm="Move this customer? Orders paid so far stay with the current admin.">
          <div>
            <label className="label" htmlFor="move-admin">Move to</label>
            <Select id="move-admin" name="adminId" defaultValue={u.adminId ?? "house"} options={[{ value: "house", label: "No admin (yours)" }, ...admins.map((x) => ({ value: x.id, label: x.name, hint: x.inviteCode ?? undefined }))]} />
          </div>
          <input aria-label="Reason (logged)" name="reason" required minLength={5} className="input" placeholder="Reason" />
          <button className="btn-secondary">Move customer</button>
        </ApiForm>
      )}
      <ApiForm action={`/api/admin/users/${u.id}`} className="card flex flex-wrap gap-2" confirm={u.status === "ACTIVE" ? "Disable this account? They won't be able to log in or order." : "Re-enable this account?"}>
        <input type="hidden" name="action" value={u.status === "ACTIVE" ? "disable" : "enable"} />
        <input aria-label="Reason (logged)" name="reason" required className="input min-w-0 flex-1" placeholder="Reason" />
        <button className={u.status === "ACTIVE" ? "btn-danger" : "btn-secondary"}>{u.status === "ACTIVE" ? "Disable account" : "Enable account"}</button>
      </ApiForm>
      <div className="card">
        <h2 className="h2 mb-2">KYC submissions</h2>
        {u.kycSubmissions.length === 0 && <p className="muted">None.</p>}
        {u.kycSubmissions.map((k) => <p key={k.id} className="text-sm"><Link className="underline" href={`/admin/kyc/${k.id}`}>{fmtIST(k.submittedAt)}</Link> · {k.fullName} · {k.status}</p>)}
      </div>
      <div className="card">
        <h2 className="h2 mb-2">Payout methods</h2>
        {u.payoutMethods.map((p) => <p key={p.id} className="text-sm">{maskedPayout(p)} · {p.holderName} · {p.status}{p.deletedAt ? " · removed" : ""}</p>)}
      </div>
      <div className="card">
        <h2 className="h2 mb-2">Sending wallets</h2>
        {u.wallets.length === 0 ? <p className="muted">None added.</p> : u.wallets.map((w) => <p key={w.id} className="text-sm break-all"><NetworkBadge network={w.network} /> <span className="font-mono text-xs">{w.address}</span>{w.label ? ` · ${w.label}` : ""}{w.deletedAt ? " · removed" : ""}</p>)}
      </div>
      <div className="card">
        <h2 className="h2 mb-2">Orders</h2>
        {u.orders.map((o) => <p key={o.id} className="text-sm"><Link className="underline" href={`/admin/orders/${o.id}`}>{o.id}</Link> · {fmtUsdt(o.usdtAmount)} USDT <NetworkBadge network={o.network} /> · {fmtInr(o.net)} · {o.status}</p>)}
      </div>
    </div>
  );
}
