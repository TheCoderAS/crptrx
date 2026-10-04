import { logoSrc } from "@/server/brand";
import Link from "next/link";
import { adminOrLogin } from "@/server/auth/pages";
import { adminCounts } from "@/server/adminCounts";
import { recentAddressChanges } from "@/server/deposit";
import { env } from "@/server/env";
import { getSettings } from "@/server/settings";
import { delayedNetworks } from "@/server/watcher";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { AdminMobileNav, AdminNav, type AdminNavItem } from "@/components/AdminNav";
import { Suspense } from "react";
import { LivePulse } from "@/components/LivePulse";
import { NavProgress } from "@/components/NavProgress";
import { LogoutButton } from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AdminPushToggle } from "@/components/PushSetting";
import { PushSync } from "@/components/PushSync";
import { SessionTimer } from "@/components/SessionTimer";
import { webPushReady } from "@/server/firebase/push";
import { Banner, Logo } from "@/components/ui";

export default async function Panel({ children }: { children: React.ReactNode }) {
  const admin = await adminOrLogin();
  const [s, changes, delayed, counts] = await Promise.all([getSettings(), recentAddressChanges(), delayedNetworks(), adminCounts(admin)]);
  const { work, reviews, unmatched, support } = counts;
  const sup = admin.role === "SUPER_ADMIN";
  const items: AdminNavItem[] = [
    { href: "/admin", label: "Dashboard", icon: "Gauge" },
    { href: "/admin/orders", label: "Orders", icon: "ListOrdered", count: work },
    { href: "/admin/users", label: "Customers", icon: "UserRound" },
    { href: "/admin/reviews", label: "Reviews", icon: "BadgeCheck", count: reviews },
    ...(sup ? ([{ href: "/admin/unmatched", label: "Unmatched payments", icon: "AlertOctagon", count: unmatched }] as AdminNavItem[]) : []),
    { href: "/admin/support", label: "Support", icon: "LifeBuoy", count: support },
    ...(sup ? ([{ href: "/admin/audit", label: "Audit log", icon: "ScrollText" }] as AdminNavItem[]) : []),
    ...(sup ? [] : ([{ href: "/admin/referrals", label: "My invite", icon: "Gift" }] as AdminNavItem[])),
    ...(sup
      ? ([
          { href: "/admin/reports", label: "Reports", icon: "FileClock" },
          { href: "/admin/admins", label: "Admins", icon: "Users" },
          { href: "/admin/settings", label: "Settings", icon: "Settings" },
        ] as AdminNavItem[])
      : []),
    ...(sup && env.devToolsEnabled && s.network_mode === "TEST" ? ([{ href: "/admin/dev", label: "Test tools", icon: "FlaskConical" }] as AdminNavItem[]) : []),
  ];
  const mode = <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide ${s.network_mode === "LIVE" ? "bg-rose-500 text-white" : "bg-amber-400 text-amber-950"}`}>{s.network_mode}</span>;
  const who = (
    <>
      <p className="truncate text-sm font-medium text-white">{admin.name}</p>
      <p className="truncate text-xs text-slate-400">{admin.email} · {sup ? "Super admin" : "Admin"}</p>
      <div className="mt-2 -ml-3 flex items-center justify-between">
        <LogoutButton action="/api/admin/auth/logout" dark />
        <span className="flex items-center gap-1">{webPushReady() && <AdminPushToggle />}<ThemeToggle dark /></span>
      </div>
    </>
  );
  return (
    <div className="admin-ui lg:flex">
      <LivePulse url="/api/admin/pulse" everyMs={20_000} />
      <SessionTimer />
      {webPushReady() && <PushSync who="admin" />}
      <Suspense fallback={null}><NavProgress /></Suspense>
      <AdminMobileNav items={items} brand={<span className="flex items-center gap-2"><Link href="/admin"><Logo name={s.brand_name} src={logoSrc(s)} inverted /></Link>{mode}</span>} badge={mode} footer={who} />
      <aside className="theme-lock sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-white/5 bg-slate-950 lg:flex">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin"><Logo name={s.brand_name} src={logoSrc(s)} inverted /></Link>
          {mode}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <AdminNav items={items} />
        </div>
        <div className="border-t border-white/10 p-4">{who}</div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl space-y-2 px-4 pt-4 empty:hidden sm:px-6">
          {delayed.map((n) => (
            <Banner key={n} tone="danger" title={`Network check delayed: ${NETWORK_INFO[n].name}`}>Payments on this network are not being confirmed. See Dashboard → Blockchain checks.</Banner>
          ))}
          {/* Cancelled changes need no warning. Waiting ones stay until they apply; applied
              ones (shown for 24 h so every admin notices) can be dismissed. */}
          {changes
            .filter((c) => !c.cancelledAt)
            .map((c) => {
              const banner = (
                <Banner tone="warn" title={`Deposit address ${c.appliedAt ? "changed" : "change pending"}: ${NETWORK_INFO[c.network as NetworkCode].name} (${c.networkMode})`}>
                  <span className="font-mono text-xs break-all">{c.newAddress}</span> · {c.appliedAt ? `took effect ${fmtIST(c.appliedAt)}` : `takes effect ${fmtIST(c.effectiveAt)}`}
                  {c.appliedAt ? <> · <Link className="font-semibold underline" href="/admin/settings">Not you? Check it</Link></> : <> · <Link className="font-semibold underline" href="/admin/settings#address">Review or cancel</Link></>}
                </Banner>
              );
              return <div key={c.id}>{banner}</div>;
            })}
        </div>
        <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
