import Link from "next/link";
import { signInMethods } from "@/server/auth/pages";
import { ApiForm } from "@/components/ApiForm";
import { AuthShell } from "@/components/AuthShell";
import { Banner } from "@/components/ui";

export const metadata = { title: "Reset your password", robots: { index: false, follow: false } };

export default async function Forgot() {
  const m = await signInMethods();
  return (
    <AuthShell brand={m.brand} logo={m.logo} title="Reset your password" subtitle="We'll email you a link to choose a new one." footer={<Link href="/login" className="font-semibold text-brand-700 hover:underline">Back to log in</Link>}>
      {m.email ? (
        <ApiForm action="/api/auth/forgot" className="space-y-4" resetOnSuccess>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@example.com" />
          </div>
          <button className="btn btn-lg bg-brand-gradient w-full text-white hover:opacity-95">Send reset link</button>
        </ApiForm>
      ) : (
        <Banner inline tone="warn">Password sign-in is turned off right now. {m.google ? "Please log in with Google." : "Please try again later."}</Banner>
      )}
      {m.google && m.email && <p className="text-xs text-slate-500">Signed up with Google? You don&apos;t need a password. Just use Continue with Google.</p>}
    </AuthShell>
  );
}
