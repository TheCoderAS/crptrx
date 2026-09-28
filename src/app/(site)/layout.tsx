import Link from "next/link";
import { currentUser } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [user, s] = await Promise.all([currentUser(), getSettings()]);
  return (
    <div className="flex min-h-screen flex-col">
      {s.network_mode === "TEST" && (
        <div className="bg-amber-400 px-4 py-1 text-center text-xs font-semibold text-amber-950">TEST MODE: test networks only. No real USDT or rupees move.</div>
      )}
      <header className="border-b border-gray-200 bg-white">
        <nav className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <Link href={user ? "/dashboard" : "/"} className="font-bold text-brand-700">USDT → ₹</Link>
          <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
            {user ? (
              <>
                <Link href="/sell" className="font-semibold text-brand-700">Sell</Link>
                <Link href="/orders">Orders</Link>
                <Link href="/account">Account</Link>
                <LogoutButton action="/api/auth/logout" />
              </>
            ) : (
              <>
                <Link href="/help">Help</Link>
                <Link href="/login" className="btn-primary px-3 py-1.5">Log in</Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl space-y-1 px-4 py-4 text-xs text-gray-500">
          <p>{s.company_name} · {s.company_address}</p>
          <p>FIU registration no.: {s.company_fiu_reg}</p>
          <p className="flex gap-3">
            <Link href="/help">Help &amp; FAQ</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
