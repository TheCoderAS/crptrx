import { redirect } from "next/navigation";
import { Landmark, Lock, ReceiptText, Timer } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { getSettings } from "@/server/settings";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { ApiForm } from "@/components/ApiForm";
import { Banner, Logo } from "@/components/ui";

export const metadata = { title: "Log in or sign up", description: "Sign in with Google to sell USDT and track your rupee payouts.", alternates: { canonical: "/login" } };

export default async function Login() {
  if (await currentUser()) redirect("/dashboard");
  const s = await getSettings();
  const fb = env.firebase.webConfig;
  const devLogin = env.devLoginEnabled && s.network_mode !== "LIVE";
  const perks = [
    { icon: Timer, tile: "tile-blue", t: "Price locked 15 minutes" },
    { icon: Landmark, tile: "tile-violet", t: "Paid to your own bank or UPI" },
    { icon: ReceiptText, tile: "tile-emerald", t: "Receipt with bank reference" },
  ];
  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[var(--shadow-float)] lg:grid-cols-2">
      <div className="bg-mesh-dark relative hidden flex-col justify-between p-10 text-white lg:flex">
        <Logo name={s.brand_name} inverted size="lg" />
        <div>
          <h2 className="text-3xl leading-tight font-bold tracking-tight">Sell USDT.<br />Get rupees you can <span className="text-emerald-300">trace.</span></h2>
          <ul className="mt-8 space-y-4">
            {perks.map(({ icon: Icon, tile, t }) => (
              <li key={t} className="flex items-center gap-3">
                <span className={`icon-tile ${tile} size-10 rounded-xl`}><Icon className="size-5" aria-hidden /></span>
                <span className="font-medium text-white/90">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="flex items-center gap-2 text-xs text-white/60"><Lock className="size-3.5" aria-hidden /> Secure sign-in. We never see your Google password.</p>
      </div>
      <div className="flex flex-col justify-center p-6 sm:p-10">
        <h1 className="text-2xl font-bold tracking-tight">Welcome</h1>
        <p className="mt-1 text-slate-500">Log in or create your account.</p>
        <div className="mt-8 space-y-4">
          {fb ? <GoogleSignIn config={fb} /> : !devLogin && <Banner tone="warn">Sign-in isn&apos;t configured yet. The owner must add the Firebase settings.</Banner>}
          {devLogin && (
            <div className="space-y-3">
              {fb && <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /> or, for testing <span className="h-px flex-1 bg-slate-200" /></div>}
              <Banner tone="warn">Test sign-in: any email, no password. Switched off automatically in Live mode.</Banner>
              <ApiForm action="/api/auth/dev-login" className="space-y-3">
                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@example.com" />
                </div>
                <button className="btn btn-lg bg-brand-gradient w-full text-white hover:opacity-95">Continue</button>
              </ApiForm>
            </div>
          )}
        </div>
        <p className="mt-8 text-xs text-slate-500">By continuing you agree to our <a href="/terms" className="underline hover:text-slate-900">Terms</a> and <a href="/privacy" className="underline hover:text-slate-900">Privacy policy</a>.</p>
      </div>
    </div>
  );
}
