import Link from "next/link";
import { signInMethods } from "@/server/auth/pages";
import { USER_MIN_PASSWORD } from "@/server/auth/password";
import { ApiForm } from "@/components/ApiForm";
import { AuthShell } from "@/components/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";
import { Banner } from "@/components/ui";

export const metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const m = await signInMethods();
  return (
    <AuthShell brand={m.brand} logo={m.logo} title="Choose a new password" footer={<Link href="/login" className="font-semibold text-brand-700 hover:underline">Back to log in</Link>}>
      {!m.email ? (
        <Banner tone="warn">Password sign-in is turned off right now.</Banner>
      ) : !token ? (
        <Banner tone="warn">This link is incomplete. Open the link from the email again, or <Link href="/forgot-password" className="underline">ask for a new one</Link>.</Banner>
      ) : (
        <ApiForm action="/api/auth/reset" className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className="label" htmlFor="password">New password</label>
            <PasswordInput id="password" autoComplete="new-password" minLength={USER_MIN_PASSWORD} />
            <p className="hint">At least {USER_MIN_PASSWORD} characters. You&apos;ll be signed out on other devices.</p>
          </div>
          <button className="btn btn-lg bg-brand-gradient w-full text-white hover:opacity-95">Save new password</button>
        </ApiForm>
      )}
    </AuthShell>
  );
}
