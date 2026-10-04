"use client";

import { useEffect } from "react";
import { inviteFromUrl, rememberInvite } from "@/lib/invite";

/** Remembers ?ref=CODE from any page of the site, for sign-up later. */
export function InviteCapture() {
  useEffect(() => {
    const code = inviteFromUrl();
    if (code) rememberInvite(code);
  }, []);
  return null;
}
