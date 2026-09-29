import Link from "next/link";
import { MailCheck } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { signInMethods } from "@/server/auth/pages";
import { ApiForm } from "@/components/ApiForm";
import { AuthShell } from "@/components/AuthShell";
import { Banner } from "@/components/ui";

export const metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string; sent?: string }> }) {
  const { token, sent } = await searchParams;
  const [m, user] = await Promise.all([signInMethods(), currentUser()]);

  // Opening the link from the email: confirm with one click (a POST, so link scanners can't use it up).
  if (token)
    return (
      <AuthShell brand={m.brand} title="Confirm your email">
        <ApiForm action="/api/auth/verify-email" className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <button className="btn btn-lg bg-brand-gradient w-full text-white hover:opacity-95">Confirm my email</button>
        </ApiForm>
      </AuthShell>
    );

  if (user?.emailVerified)
    return (
      <AuthShell brand={m.brand} title="Email confirmed">
        <Banner tone="ok">Your email is confirmed.</Banner>
        <Link href="/dashboard" className="btn-primary btn-lg w-full">Go to dashboard</Link>
      </AuthShell>
    );

  return (
    <AuthShell brand={m.brand} title="Check your inbox" footer={user ? <p>Wrong email? Log out (top right) and sign up again.</p> : <Link href="/login" className="font-semibold text-brand-700 hover:underline">Back to log in</Link>}>
      <div className="flex items-start gap-4 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100">
        <span className="icon-tile tile-blue"><MailCheck className="size-5" aria-hidden /></span>
        <p className="text-sm text-slate-700">
          {user ? <>We sent a confirmation link to <b className="[overflow-wrap:anywhere]">{user.email}</b>.</> : sent ? "If that email can be used, a message is on its way." : "Open the link we emailed you."} It works for 24 hours.
        </p>
      </div>
      {user && (
        <ApiForm action="/api/auth/resend-verification" className="space-y-3">
          <button className="btn-secondary w-full">Send a new link</button>
        </ApiForm>
      )}
      <p className="text-xs text-slate-500">Can&apos;t find it? Check spam or promotions.</p>
    </AuthShell>
  );
}
