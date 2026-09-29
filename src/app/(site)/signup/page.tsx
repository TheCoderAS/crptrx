import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { signInMethods } from "@/server/auth/pages";
import { USER_MIN_PASSWORD } from "@/server/auth/password";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { ApiForm } from "@/components/ApiForm";
import { AuthShell, DevLogin, OrDivider } from "@/components/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";
import { Banner } from "@/components/ui";

export const metadata = { title: "Create your account", description: "Create an account to sell USDT for rupees paid to your own bank or UPI.", alternates: { canonical: "/signup" } };

export default async function Signup() {
  if (await currentUser()) redirect("/dashboard");
  const m = await signInMethods();
  const none = !m.google && !m.email && !m.dev;
  return (
    <AuthShell
      brand={m.brand}
      title="Create your account"
      subtitle="Takes about a minute."
      footer={
        <>
          <p>Already have an account? <Link href="/login" className="font-semibold text-brand-700 hover:underline">Log in</Link></p>
          <p className="mt-3 text-xs text-slate-500">By creating an account you agree to our <a href="/terms" className="underline hover:text-slate-900">Terms</a> and <a href="/privacy" className="underline hover:text-slate-900">Privacy policy</a>.</p>
        </>
      }
    >
      {none && <Banner tone="warn">Sign-up is temporarily unavailable. Please try again later.</Banner>}
      {m.google && <GoogleSignIn config={m.google} label="Sign up with Google" />}
      {m.google && m.email && <OrDivider />}
      {m.email && (
        <ApiForm action="/api/auth/register" className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@example.com" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <PasswordInput id="password" autoComplete="new-password" minLength={USER_MIN_PASSWORD} />
            <p className="hint">At least {USER_MIN_PASSWORD} characters.</p>
          </div>
          <button className="btn btn-lg bg-brand-gradient w-full text-white hover:opacity-95">Create account</button>
          {m.verificationRequired && <p className="text-center text-xs text-slate-500">We&apos;ll email you a link to confirm your address.</p>}
        </ApiForm>
      )}
      {!m.email && !m.google && m.dev && <DevLogin collapsed={false} />}
    </AuthShell>
  );
}
