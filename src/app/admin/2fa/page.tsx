import { redirect } from "next/navigation";
import { currentAdmin, pendingAdmin } from "@/server/auth/session";
import { ApiForm } from "@/components/ApiForm";
import { TotpSetup } from "@/components/TotpSetup";

export default async function Admin2fa() {
  if (await currentAdmin()) redirect("/admin");
  const admin = await pendingAdmin();
  if (!admin) redirect("/admin/login");
  return (
    <div className="mx-auto max-w-sm space-y-4 px-4 py-16">
      <h1 className="h1">Two-step login</h1>
      {!admin.totpEnabled && <TotpSetup />}
      <ApiForm action="/api/admin/auth/totp" className="card space-y-3">
        <label className="label" htmlFor="code">6-digit code from your authenticator app</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="input text-center text-xl tracking-widest" />
        <button className="btn-primary w-full">Verify</button>
      </ApiForm>
    </div>
  );
}
