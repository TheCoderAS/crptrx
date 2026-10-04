"use client";

import { useEffect, useState } from "react";
import { GoogleSignIn } from "./GoogleSignIn";
import { rememberedInvite } from "@/lib/invite";

type GoogleConfig = { apiKey: string; authDomain: string; projectId: string; appId?: string };

/** Google on the log-in page: a first-timer who came from an invite link still gets the code. */
export function LoginGoogle({ config }: { config: GoogleConfig }) {
  const [code, setCode] = useState("");
  useEffect(() => setCode(rememberedInvite()), []);
  return <GoogleSignIn config={config} inviteCode={code || undefined} inviteSoft />;
}
