import { logoSrc } from "@/server/brand";
import { redirect } from "next/navigation";
import { currentAdmin, pendingAdmin } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { ApiForm } from "@/components/ApiForm";
import { TotpSetup } from "@/components/TotpSetup";
import { Logo } from "@/components/ui";

export default async function Admin2fa() {
  if (await currentAdmin()) redirect("/admin");
  const admin = await pendingAdmin();
  if (!admin) redirect("/admin/login");
  const s = await getSettings();
  return (
    <div className="theme-lock grid min-h-screen place-items-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-sm space-y-4">
        <div className="mb-4 flex justify-center"><Logo name={s.brand_name} src={logoSrc(s)} inverted size="lg" /></div>
        {!admin.totpEnabled && <TotpSetup />}
        <ApiForm action="/api/admin/auth/totp" className="card space-y-4 p-6 sm:p-8">
          <div>
            <h1 className="text-lg font-semibold">Two-step login</h1>
            <p className="text-sm text-slate-500">Step 2 of 2: enter the 6-digit code from your authenticator app.</p>
          </div>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus className="input py-3 text-center font-mono text-2xl tracking-[0.5em]" aria-label="6-digit code" />
          <button className="btn-primary w-full">Verify</button>
        </ApiForm>
      </div>
    </div>
  );
}
