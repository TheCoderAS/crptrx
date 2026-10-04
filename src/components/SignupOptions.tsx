"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Gift } from "lucide-react";
import { ApiForm } from "./ApiForm";
import { GoogleSignIn } from "./GoogleSignIn";
import { PasswordInput } from "./PasswordInput";
import { inviteFromUrl, rememberedInvite, rememberInvite } from "@/lib/invite";

type GoogleConfig = { apiKey: string; authDomain: string; projectId: string; appId?: string };
type Check = "idle" | "checking" | "ok" | "bad";

/** Sign-up choices with the invite code box above them (filled in from an invite link). */
export function SignupOptions({ google, email, minPassword, verificationRequired }: { google: GoogleConfig | null; email: boolean; minPassword: number; verificationRequired: boolean }) {
  const [code, setCode] = useState("");
  const [check, setCheck] = useState<Check>("idle");

  useEffect(() => {
    setCode(inviteFromUrl() || rememberedInvite());
  }, []);

  // Check the code a moment after typing stops, so Google sign-in never waits on it.
  useEffect(() => {
    const c = code.trim();
    if (!c) return setCheck("idle");
    setCheck("checking");
    let on = true;
    const t = setTimeout(async () => {
      const res = await fetch("/api/auth/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: c }) }).catch(() => null);
      if (!on) return;
      if (res?.ok) {
        setCheck("ok");
        rememberInvite(c);
      } else setCheck(res?.status === 422 ? "bad" : "idle"); // network or rate limit: let the server decide at sign-up
    }, 400);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [code]);

  const clear = () => {
    setCode("");
    rememberInvite("");
  };
  const waiting = check === "checking" || check === "bad";

  return (
    <div className="space-y-5">
      <div>
        <label className="label flex items-center gap-1.5" htmlFor="inviteCode"><Gift className="size-4 text-brand-600" aria-hidden /> Invite code <span className="font-normal text-slate-500">(optional)</span></label>
        <input
          id="inviteCode"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16))}
          className="input font-mono tracking-wider uppercase"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="If someone gave you one"
          aria-invalid={check === "bad"}
          aria-describedby="invite-status"
        />
        <div id="invite-status" aria-live="polite" className="mt-1.5 min-h-5 text-sm">
          {check === "ok" && <p className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="size-4" aria-hidden /> Code applied</p>}
          {check === "bad" && (
            <p className="text-rose-700">
              Code not found.{" "}
              <button type="button" onClick={clear} className="font-semibold underline hover:text-rose-900">Continue without a code</button>
            </p>
          )}
        </div>
      </div>
      {google && <GoogleSignIn config={google} label="Sign up with Google" inviteCode={code.trim() || undefined} blocked={waiting} />}
      {google && email && <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" /></div>}
      {email && (
        <ApiForm action="/api/auth/register" className="space-y-4">
          <input type="hidden" name="inviteCode" value={code.trim()} />
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@example.com" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <PasswordInput id="password" autoComplete="new-password" minLength={minPassword} />
            <p className="hint">At least {minPassword} characters.</p>
          </div>
          <button disabled={waiting} className="btn btn-lg bg-brand-gradient w-full text-white hover:opacity-95 disabled:opacity-60">Create account</button>
          {verificationRequired && <p className="text-center text-xs text-slate-500">We&apos;ll email you a link to confirm your address.</p>}
        </ApiForm>
      )}
    </div>
  );
}
