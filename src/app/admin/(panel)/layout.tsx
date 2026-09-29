import Link from "next/link";
import { adminOrLogin } from "@/server/auth/pages";
import { prisma } from "@/server/db";
import { recentAddressChanges } from "@/server/deposit";
import { env } from "@/server/env";
import { getSettings } from "@/server/settings";
import { delayedNetworks } from "@/server/watcher";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { AdminNav, type AdminNavItem } from "@/components/AdminNav";
import { LogoutButton } from "@/components/LogoutButton";
import { Banner, Logo } from "@/components/ui";

export default async function Panel({ children }: { children: React.ReactNode }) {
  const admin = await adminOrLogin();
  const [s, changes, delayed, kyc, pms, work, unmatched, support] = await Promise.all([
    getSettings(),
    recentAddressChanges(),
    delayedNetworks(),
    prisma.kycSubmission.count({ where: { status: "SUBMITTED" } }),
    prisma.payoutMethod.count({ where: { status: "PENDING", deletedAt: null } }),
    prisma.order.count({ where: { status: { in: ["PAYMENT_CONFIRMED", "UNDER_REVIEW", "APPROVED"] } } }),
    prisma.incomingTransfer.count({ where: { status: "UNMATCHED" } }),
    prisma.supportMessage.count({ where: { handled: false } }),
  ]);
  const sup = admin.role === "SUPER_ADMIN";
  const items: AdminNavItem[] = [
    { href: "/admin", label: "Dashboard", icon: "Gauge" },
    { href: "/admin/orders", label: "Orders", icon: "ListOrdered", count: work },
    { href: "/admin/kyc", label: "KYC", icon: "BadgeCheck", count: kyc },
    { href: "/admin/payout-methods", label: "Payout methods", icon: "Landmark", count: pms },
    { href: "/admin/unmatched", label: "Unmatched payments", icon: "AlertOctagon", count: unmatched },
    { href: "/admin/support", label: "Support", icon: "LifeBuoy", count: support },
    { href: "/admin/audit", label: "Audit log", icon: "ScrollText" },
    ...(sup
      ? ([
          { href: "/admin/reports", label: "Reports", icon: "FileClock" },
          { href: "/admin/admins", label: "Admins", icon: "Users" },
          { href: "/admin/settings", label: "Settings", icon: "Settings" },
        ] as AdminNavItem[])
      : []),
    ...(sup && env.devToolsEnabled && s.network_mode === "TEST" ? ([{ href: "/admin/dev", label: "Test tools", icon: "FlaskConical" }] as AdminNavItem[]) : []),
  ];
  return (
    <div className="lg:flex">
      <aside className="bg-slate-950 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <Link href="/admin"><Logo name={s.brand_name} inverted /></Link>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide ${s.network_mode === "LIVE" ? "bg-rose-500 text-white" : "bg-amber-400 text-amber-950"}`}>{s.network_mode}</span>
        </div>
        <div className="px-3 pb-3 lg:flex-1 lg:overflow-y-auto">
          <AdminNav items={items} />
        </div>
        <div className="hidden border-t border-white/10 p-4 lg:block">
          <p className="truncate text-sm font-medium text-white">{admin.name}</p>
          <p className="truncate text-xs text-slate-400">{admin.email} · {sup ? "Super admin" : "Admin"}</p>
          <div className="mt-2 -ml-3"><LogoutButton action="/api/admin/auth/logout" dark /></div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl space-y-3 px-4 pt-6 sm:px-8">
          {delayed.map((n) => (
            <Banner key={n} tone="danger" title={`Network check delayed: ${NETWORK_INFO[n].name}`}>Payments on this network are not being confirmed. See Dashboard → Blockchain checks.</Banner>
          ))}
          {changes.map((c) => (
            <Banner key={c.id} tone="warn" title={`Deposit address change: ${NETWORK_INFO[c.network as NetworkCode].name} (${c.networkMode})`}>
              <span className="font-mono text-xs break-all">{c.newAddress}</span> ·{" "}
              {c.cancelledAt ? `cancelled ${fmtIST(c.cancelledAt)}` : c.appliedAt ? `took effect ${fmtIST(c.appliedAt)}` : `takes effect ${fmtIST(c.effectiveAt)}`}
              {!c.cancelledAt && !c.appliedAt && <> · <Link className="font-semibold underline" href="/admin/settings#address">Review or cancel</Link></>}
            </Banner>
          ))}
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8">{children}</main>
        <div className="flex items-center justify-between px-4 pb-6 text-xs text-slate-400 sm:px-8 lg:justify-center">
          <span>Sessions end after 30 minutes without activity.</span>
          <span className="lg:hidden"><LogoutButton action="/api/admin/auth/logout" /></span>
        </div>
      </div>
    </div>
  );
}
