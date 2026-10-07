import { ArrowRightLeft, Ban, CheckCircle2, Gift, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { pageUser } from "@/server/scope";
import { D, fmtInr, fmtUsdt } from "@/server/money";
import { maskedPayout } from "@/server/payouts";
import { fmtIST } from "@/lib/time";
import { ModalForm } from "@/components/Modal";
import { Select } from "@/components/Select";
import { BackLink, NetworkBadge, Row, Section, StatusPill, statusLabel } from "@/components/ui";

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await adminOrLogin();
  const sup = me.role === "SUPER_ADMIN";
  const { id } = await params;
  const u = await prisma.user.findUnique({ where: { id }, include: { admin: { select: { id: true, name: true } }, kycSubmissions: { orderBy: { submittedAt: "desc" } }, payoutMethods: true, wallets: { orderBy: { createdAt: "asc" } }, orders: { orderBy: { createdAt: "desc" }, take: 50 } } });
  if (!u) notFound();
  await pageUser(me, u.id);
  const admins = sup ? await prisma.admin.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true, name: true, inviteCode: true }, orderBy: { name: "asc" } }) : [];
  const signIn = [u.firebaseUid && !u.firebaseUid.startsWith("dev:") && "Google", u.passwordHash && "Password", u.firebaseUid?.startsWith("dev:") && "Test"].filter(Boolean).join(", ") || "—";
  const bonus = D(u.rewardPercent);
  const active = u.status === "ACTIVE";
  const paid = u.orders.filter((o) => o.status === "PAID");
  const paidTotal = paid.reduce((t, o) => t.plus(D(o.net)), D(0));
  return (
    <div className="space-y-4">
      <BackLink href="/admin/users">Customers</BackLink>

      {/* Who it is, at a glance, with every action right here at the top. */}
      <div className="card space-y-4">
        <div className="flex items-start gap-3">
          <span className="icon-tile tile-blue size-11 shrink-0 rounded-xl"><UserRound className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold break-all text-slate-900">{u.email}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <StatusPill status={u.status} />
              <StatusPill status={u.kycStatus} label={`KYC: ${statusLabel(u.kycStatus)}`} />
              {bonus.gt(0) && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200 ring-inset">Bonus {bonus.toString()}% of share</span>}
              {sup && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700">{u.admin ? `Admin: ${u.admin.name}` : "No admin"}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <ModalForm
            button={<><Gift className="size-4" aria-hidden /> Bonus reward</>}
            buttonClassName="btn-secondary px-3 py-2 text-sm"
            title="Bonus reward"
            description={`Part of ${u.adminId ? (sup ? "the admin's" : "your") : "your"} margin share that this customer gets on each new order. The customer only sees the amount.`}
            action={`/api/admin/users/${u.id}/reward`}
            submitLabel="Save"
          >
            <div>
              <label className="label" htmlFor="reward">% of the share</label>
              <div className="relative">
                <input id="reward" name="rewardPercent" defaultValue={bonus.toString()} inputMode="decimal" className="input pr-10" />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">%</span>
              </div>
              <p className="hint">0 = none.</p>
            </div>
          </ModalForm>
          {sup && (
            <ModalForm
              button={<><ArrowRightLeft className="size-4" aria-hidden /> Move to admin</>}
              buttonClassName="btn-secondary px-3 py-2 text-sm"
              title="Move this customer"
              description="New orders count for the new admin. Orders paid so far stay with the current one."
              action={`/api/admin/users/${u.id}/admin`}
              submitLabel="Move customer"
            >
              <div>
                <label className="label" htmlFor="move-admin">Move to</label>
                <Select id="move-admin" name="adminId" defaultValue={u.adminId ?? "house"} options={[{ value: "house", label: "No admin (yours)" }, ...admins.map((x) => ({ value: x.id, label: x.name, hint: x.inviteCode ?? undefined }))]} />
              </div>
              <div><label className="label" htmlFor="move-reason">Reason (logged)</label><input id="move-reason" name="reason" required minLength={5} className="input" /></div>
            </ModalForm>
          )}
          <ModalForm
            button={active ? <><Ban className="size-4" aria-hidden /> Disable</> : <><CheckCircle2 className="size-4" aria-hidden /> Enable</>}
            buttonClassName={active ? "btn-ghost px-3 py-2 text-sm text-rose-700 hover:bg-rose-50" : "btn-secondary px-3 py-2 text-sm"}
            title={active ? "Disable this account?" : "Enable this account?"}
            description={active ? "They're signed out and can't log in or place orders." : "They can log in and order again."}
            action={`/api/admin/users/${u.id}`}
            submitLabel={active ? "Disable account" : "Enable account"}
          >
            <input type="hidden" name="action" value={active ? "disable" : "enable"} />
            <div><label className="label" htmlFor="status-reason">Reason (logged)</label><input id="status-reason" name="reason" required className="input" /></div>
          </ModalForm>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Profile">
          <Row k="Mobile" v={u.mobile ?? "—"} />
          <Row k="Sign-in" v={signIn} />
          <Row k="Email confirmed" v={u.emailVerified ? "Yes" : "No"} />
          {u.lockedUntil && u.lockedUntil > new Date() && <Row k="Password locked until" v={fmtIST(u.lockedUntil)} />}
          <Row k="Joined" v={fmtIST(u.createdAt)} />
          {sup && u.admin && u.referredAt && <Row k="With admin since" v={fmtIST(u.referredAt)} />}
          <Row k="Paid orders" v={`${paid.length} · ${fmtInr(paidTotal)}`} />
        </Section>
        <Section title="Identity checks">
          {u.kycSubmissions.length === 0 ? <p className="muted">None yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {u.kycSubmissions.map((k) => (
                <li key={k.id}>
                  <Link href={`/admin/kyc/${k.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-brand-700">
                    <span className="min-w-0 truncate">{k.fullName} · <span className="text-slate-500">{fmtIST(k.submittedAt)}</span></span>
                    <StatusPill status={k.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Bank & UPI">
          {u.payoutMethods.length === 0 ? <p className="muted">None added.</p> : (
            <ul className="divide-y divide-slate-100">
              {u.payoutMethods.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate">{maskedPayout(p)} · <span className="text-slate-500">{p.holderName}</span></span>
                  {p.deletedAt ? <span className="text-xs text-slate-500">Removed</span> : <StatusPill status={p.status} />}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Sending wallets">
          {u.wallets.length === 0 ? <p className="muted">None added.</p> : (
            <ul className="divide-y divide-slate-100">
              {u.wallets.map((w) => (
                <li key={w.id} className="flex items-center gap-2 py-2 text-sm">
                  <NetworkBadge network={w.network} />
                  <span className="min-w-0 flex-1 font-mono text-xs break-all">{w.address}</span>
                  {(w.label || w.deletedAt) && <span className="shrink-0 text-xs text-slate-500">{w.deletedAt ? "Removed" : w.label}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Orders" description={u.orders.length === 50 ? "The 50 newest." : undefined}>
        {u.orders.length === 0 ? <p className="muted">No orders yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {u.orders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm hover:text-brand-700">
                  <span className="flex items-center gap-2 font-medium">{o.id} <NetworkBadge network={o.network} /></span>
                  <span className="flex items-center gap-3 text-slate-600">
                    <span className="tabular-nums">{fmtUsdt(o.usdtAmount)} USDT · {fmtInr(o.net)}</span>
                    <StatusPill status={o.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
