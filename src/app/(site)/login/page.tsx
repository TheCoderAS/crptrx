import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { signInMethods } from "@/server/auth/pages";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { ApiForm } from "@/components/ApiForm";
import { AuthShell, DevLogin, OrDivider } from "@/components/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";
import { Banner } from "@/components/ui";

export const metadata = { title: "Log in", description: "Log in to sell USDT and track your rupee payouts.", alternates: { canonical: "/login" } };

export default async function Login({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  if (await currentUser()) redirect("/dashboard");
  const { reset } = await searchParams;
  const m = await signInMethods();
  const none = !m.google && !m.email && !m.dev;
  return (
    <AuthShell
      brand={m.brand}
      title="Welcome back"
      subtitle="Log in to your account."
      footer={
        <>
          {m.email && <p>New here? <Link href="/signup" className="font-semibold text-brand-700 hover:underline">Create an account</Link></p>}
          <p className="mt-3 text-xs text-slate-500">By continuing you agree to our <a href="/terms" className="underline hover:text-slate-900">Terms</a> and <a href="/privacy" className="underline hover:text-slate-900">Privacy policy</a>.</p>
        </>
      }
    >
      {reset && <Banner tone="ok">Password changed. Log in with your new password.</Banner>}
      {none && <Banner tone="warn">Sign-in is temporarily unavailable. Please try again later.</Banner>}
      {m.google && <GoogleSignIn config={m.google} />}
      {m.google && m.email && <OrDivider />}
      {m.email && (
        <ApiForm action="/api/auth/login" className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@example.com" />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700" htmlFor="password">Password</label>
              <Link href="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">Forgot password?</Link>
            </div>
            <PasswordInput id="password" autoComplete="current-password" />
          </div>
          <button className="btn btn-lg bg-brand-gradient w-full text-white hover:opacity-95">Log in</button>
        </ApiForm>
      )}
      {m.dev && <DevLogin collapsed={!!(m.google || m.email)} />}
    </AuthShell>
  );
}
