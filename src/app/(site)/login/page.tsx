import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { ApiForm } from "@/components/ApiForm";
import { Banner } from "@/components/ui";

export const metadata = { title: "Log in" };

export default async function Login() {
  if (await currentUser()) redirect("/dashboard");
  const fb = env.firebase.webConfig;
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="h1">Log in or sign up</h1>
      {fb ? (
        <div className="card space-y-3">
          <GoogleSignIn config={fb} />
          <p className="muted">We use your Google account to sign you in. Your email must be verified with Google.</p>
        </div>
      ) : (
        !env.devLoginEnabled && <Banner tone="warn">Sign-in isn&apos;t configured yet. The owner must set the Firebase settings.</Banner>
      )}
      {env.devLoginEnabled && (
        <div className="card space-y-3">
          <Banner tone="warn">Test sign-in (test phases only). Anyone can log in as any email. Turn this off before launch.</Banner>
          <ApiForm action="/api/auth/dev-login" className="space-y-3">
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required className="input" placeholder="tester@example.com" />
            <button className="btn-primary w-full">Continue</button>
          </ApiForm>
        </div>
      )}
    </div>
  );
}
