import { redirect } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { getSettings } from "@/server/settings";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { ApiForm } from "@/components/ApiForm";
import { Banner, Logo } from "@/components/ui";

export const metadata = { title: "Log in" };

export default async function Login() {
  if (await currentUser()) redirect("/dashboard");
  const s = await getSettings();
  const fb = env.firebase.webConfig;
  const devLogin = env.devLoginEnabled && s.network_mode !== "LIVE";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-4 sm:py-10">
      <Logo name={s.brand_name} size="lg" />
      <div className="card mt-8 w-full space-y-6 p-6 sm:p-8">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">Log in or create an account</h1>
          <p className="mt-1.5 text-sm text-slate-500">One account for selling USDT and tracking your payouts.</p>
        </div>
        {fb ? (
          <GoogleSignIn config={fb} />
        ) : (
          !devLogin && <Banner tone="warn">Sign-in isn&apos;t configured yet. The owner must add the Firebase settings.</Banner>
        )}
        {devLogin && (
          <div className="space-y-3">
            {fb && (
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" /> or, for testing <span className="h-px flex-1 bg-slate-200" />
              </div>
            )}
            <Banner tone="warn">Test sign-in: works with any email, with no password. It is switched off automatically in Live mode.</Banner>
            <ApiForm action="/api/auth/dev-login" className="space-y-3">
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@example.com" />
              </div>
              <button className="btn-primary w-full">Continue</button>
            </ApiForm>
          </div>
        )}
      </div>
      <div className="mt-6 flex flex-col items-center gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden /> Secure sign-in. We never see your Google password.</span>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" aria-hidden /> By continuing you agree to our <a href="/terms" className="underline hover:text-slate-900">Terms</a> and <a href="/privacy" className="underline hover:text-slate-900">Privacy policy</a>.</span>
      </div>
    </div>
  );
}
