import { UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { fmtInr, fmtUsdt } from "@/server/money";
import { maskedPayout } from "@/server/payouts";
import { fmtIST } from "@/lib/time";
import { ApiForm } from "@/components/ApiForm";
import { NetworkBadge, PageHeader, Row, StatusPill } from "@/components/ui";

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  await adminOrLogin();
  const { id } = await params;
  const u = await prisma.user.findUnique({ where: { id }, include: { kycSubmissions: { orderBy: { submittedAt: "desc" } }, payoutMethods: true, wallets: { orderBy: { createdAt: "asc" } }, orders: { orderBy: { createdAt: "desc" }, take: 50 } } });
  if (!u) notFound();
  return (
    <div className="space-y-4">
      <PageHeader title={u.email} icon={<UserRound className="size-6" />} />
      <div className="card">
        <Row k="Status" v={<StatusPill status={u.status} />} />
        <Row k="Mobile" v={u.mobile ?? "—"} />
        <Row k="Sign-in" v={[u.firebaseUid && !u.firebaseUid.startsWith("dev:") && "Google", u.passwordHash && "Password", u.firebaseUid?.startsWith("dev:") && "Test"].filter(Boolean).join(", ") || "—"} />
        <Row k="Email confirmed" v={u.emailVerified ? "Yes" : "No"} />
        {u.lockedUntil && u.lockedUntil > new Date() && <Row k="Password locked until" v={fmtIST(u.lockedUntil)} />}
        <Row k="KYC" v={<StatusPill status={u.kycStatus} />} />
        <Row k="Joined" v={fmtIST(u.createdAt)} />
      </div>
      <ApiForm action={`/api/admin/users/${u.id}`} className="card flex flex-wrap gap-2" confirm={u.status === "ACTIVE" ? "Disable this account? They won't be able to log in or order." : "Re-enable this account?"}>
        <input type="hidden" name="action" value={u.status === "ACTIVE" ? "disable" : "enable"} />
        <input name="reason" required className="input flex-1" placeholder="Reason (logged)" />
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
