import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { signInMethods } from "@/server/auth/pages";
import { USER_MIN_PASSWORD } from "@/server/auth/password";
import { AuthShell, DevLogin } from "@/components/AuthShell";
import { SignupOptions } from "@/components/SignupOptions";
import { Banner } from "@/components/ui";

export const metadata = { title: "Create your account", description: "Create an account to sell USDT for rupees paid to your own bank or UPI.", alternates: { canonical: "/signup" } };

export default async function Signup() {
  if (await currentUser()) redirect("/dashboard");
  const m = await signInMethods();
  const none = !m.google && !m.email && !m.dev;
  return (
    <AuthShell
      brand={m.brand}
      logo={m.logo}
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
      {(m.google || m.email) && <SignupOptions google={m.google ?? null} email={!!m.email} minPassword={USER_MIN_PASSWORD} verificationRequired={!!m.verificationRequired} />}
      {!m.email && !m.google && m.dev && <DevLogin collapsed={false} />}
    </AuthShell>
  );
}
