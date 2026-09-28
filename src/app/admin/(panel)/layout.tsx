import Link from "next/link";
import { adminOrLogin } from "@/server/auth/pages";
import { recentAddressChanges } from "@/server/deposit";
import { getSettings } from "@/server/settings";
import { delayedNetworks } from "@/server/watcher";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { LogoutButton } from "@/components/LogoutButton";
import { env } from "@/server/env";

export default async function Panel({ children }: { children: React.ReactNode }) {
  const admin = await adminOrLogin();
  const [s, changes, delayed] = await Promise.all([getSettings(), recentAddressChanges(), delayedNetworks()]);
  const superOnly = admin.role === "SUPER_ADMIN";
  const nav: [string, string, boolean][] = [
    ["/admin", "Dashboard", true],
    ["/admin/kyc", "KYC", true],
    ["/admin/payout-methods", "Payout methods", true],
    ["/admin/orders", "Orders", true],
    ["/admin/unmatched", "Unmatched payments", true],
    ["/admin/support", "Support", true],
    ["/admin/settings", "Settings", superOnly],
    ["/admin/admins", "Admins", superOnly],
    ["/admin/reports", "Reports", superOnly],
    ["/admin/audit", "Audit log", true],
    ["/admin/dev", "Test tools", superOnly && env.devToolsEnabled && s.network_mode === "TEST"],
  ];
  return (
    <div>
      {s.network_mode === "TEST" && <div className="bg-amber-400 px-4 py-1 text-center text-xs font-semibold">TEST MODE (Tron Nile + BSC Testnet)</div>}
      {s.network_mode === "LIVE" && <div className="bg-red-700 px-4 py-1 text-center text-xs font-semibold text-white">LIVE MODE: real USDT</div>}
      <header className="bg-gray-900 text-gray-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
          <span className="font-bold">Admin</span>
          {nav.filter((n) => n[2]).map(([href, label]) => <Link key={href} href={href} className="hover:text-white text-gray-300">{label}</Link>)}
          <span className="ml-auto text-gray-400">{admin.name} ({admin.role === "SUPER_ADMIN" ? "super admin" : "admin"})</span>
          <LogoutButton action="/api/admin/auth/logout" />
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-3 px-4 pt-4">
        {delayed.map((n) => (
          <div key={n} className="rounded-lg bg-red-600 p-3 text-sm font-semibold text-white">Network check delayed: {NETWORK_INFO[n].name}. Payments on this network are not being confirmed.</div>
        ))}
        {changes.map((c) => (
          <div key={c.id} className="rounded-lg bg-orange-100 p-3 text-sm text-orange-900 ring-1 ring-orange-300">
            <b>Deposit address change ({NETWORK_INFO[c.network as NetworkCode].name}, {c.networkMode}):</b> {c.newAddress} ·{" "}
            {c.cancelledAt ? `cancelled ${fmtIST(c.cancelledAt)}` : c.appliedAt ? `took effect ${fmtIST(c.appliedAt)}` : `takes effect ${fmtIST(c.effectiveAt)}`}
            {!c.cancelledAt && !c.appliedAt && <> · <Link className="font-semibold underline" href={`/admin/settings#address`}>Review / cancel</Link></>}
          </div>
        ))}
      </div>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <p className="pb-6 text-center text-xs text-gray-400">Sessions end after 30 minutes without activity.</p>
    </div>
  );
}
