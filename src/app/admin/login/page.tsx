import { redirect } from "next/navigation";
import { currentAdmin } from "@/server/auth/session";
import { ApiForm } from "@/components/ApiForm";

export default async function AdminLogin() {
  if (await currentAdmin()) redirect("/admin");
  return (
    <div className="mx-auto max-w-sm space-y-4 px-4 py-16">
      <h1 className="h1">Admin sign-in</h1>
      <ApiForm action="/api/admin/auth/login" className="card space-y-3">
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" className="input" />
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        <button className="btn-primary w-full">Next</button>
      </ApiForm>
      <p className="muted">Two-step login with an authenticator app is required for every admin.</p>
    </div>
  );
}
