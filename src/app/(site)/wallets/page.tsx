import Link from "next/link";
import { Wallet } from "lucide-react";
import { userOrLogin } from "@/server/auth/pages";
import { getSettings } from "@/server/settings";
import { listWallets, MAX_WALLETS_PER_NETWORK } from "@/server/wallets";
import { NETWORK_CODES, NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { ApiForm } from "@/components/ApiForm";
import { WalletRemoveButton } from "@/components/WalletRemoveButton";
import { BackLink, Banner, EmptyState, NetworkBadge, PageHeader, Section } from "@/components/ui";

export const metadata = { title: "Your wallets", robots: { index: false, follow: false } };

export default async function Wallets() {
  const user = await userOrLogin();
  const [s, wallets] = await Promise.all([getSettings(), listWallets(user.id)]);
  const mode = s.wallet_registration;
  const networks = NETWORK_CODES.filter((n) => s.network_enabled[n]);
  return (
    <div className="space-y-6">
      <BackLink href="/account">Account</BackLink>
      <PageHeader
        title="Your wallets"
        subtitle={mode === "REQUIRED" ? "Send USDT only from a wallet listed here." : "The wallets you send USDT from."}
        icon={<Wallet className="size-6" />}
        tile="tile-amber"
      />
      {mode === "OFF" ? (
        <Banner tone="info">You don&apos;t need to add wallets right now. <Link href="/dashboard" className="font-medium underline">Back to home</Link></Banner>
      ) : mode === "REQUIRED" ? (
        <Banner tone="warn" title="Payments from other wallets are held">If you send from a wallet that isn&apos;t listed, your order is paused until we check it. Exchange withdrawals come from the exchange&apos;s wallet, so send from your own wallet.</Banner>
      ) : null}

      <Section title="Saved wallets">
        {wallets.length === 0 ? (
          <EmptyState icon={<Wallet className="size-6" />} title="No wallets yet">Add the address you&apos;ll send USDT from.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {wallets.map((w) => (
              <li key={w.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <NetworkBadge network={w.network as NetworkCode} />
                    {w.label && <span className="text-sm font-medium text-slate-900">{w.label}</span>}
                  </div>
                  <p className="mt-1 font-mono text-xs break-all text-slate-600">{w.address}</p>
                </div>
                <WalletRemoveButton id={w.id} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {mode !== "OFF" && (
        <ApiForm action="/api/wallets" className="card space-y-4" resetOnSuccess>
          <h2 className="h2">Add a wallet</h2>
          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <div>
              <label className="label" htmlFor="network">Network</label>
              <select id="network" name="network" className="input" defaultValue={networks[0]}>
                {networks.map((n) => <option key={n} value={n}>{NETWORK_INFO[n].name}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <label className="label" htmlFor="address">Wallet address</label>
              <input id="address" name="address" required autoComplete="off" spellCheck={false} className="input font-mono text-sm" placeholder="T… or 0x…" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="label">Name <span className="font-normal text-slate-500">(optional)</span></label>
            <input id="label" name="label" maxLength={40} className="input" placeholder="e.g. My Trust Wallet" />
          </div>
          <button className="btn-primary">Add wallet</button>
          <p className="text-xs text-slate-500">Up to {MAX_WALLETS_PER_NETWORK} per network. Don&apos;t add our deposit address here.</p>
        </ApiForm>
      )}
    </div>
  );
}
