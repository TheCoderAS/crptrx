import { logoSrc } from "@/server/brand";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { currentAdmin } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { ApiForm } from "@/components/ApiForm";
import { Logo } from "@/components/ui";

export default async function AdminLogin() {
  if (await currentAdmin()) redirect("/admin");
  const s = await getSettings();
  return (
    <div className="theme-lock grid min-h-screen place-items-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo name={s.brand_name} src={logoSrc(s)} inverted size="lg" /></div>
        <ApiForm action="/api/admin/auth/login" className="card space-y-4 p-6 sm:p-8">
          <div>
            <h1 className="text-lg font-semibold">Admin sign-in</h1>
            <p className="text-sm text-slate-500">Step 1 of 2: password</p>
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="username" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
          </div>
          <button className="btn-primary w-full">Next</button>
        </ApiForm>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400"><ShieldCheck className="size-3.5" aria-hidden /> Authenticator app required for every admin.</p>
      </div>
    </div>
  );
}
