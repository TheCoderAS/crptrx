"use client";

// An invite link (any page with ?ref=CODE) is remembered for this browser session only
// (sessionStorage: until the tab or app is closed), so the code is filled in whenever the
// person signs up during that visit. Nothing is kept on the device afterwards.
const KEY = "invite-code";

export function rememberedInvite(): string {
  try {
    // Older versions kept the code for 30 days; drop it.
    localStorage.removeItem(KEY);
  } catch {
    /* no storage */
  }
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberInvite(code: string) {
  try {
    if (code) sessionStorage.setItem(KEY, code);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

/** ?ref=CODE from the current address, cleaned up. */
export function inviteFromUrl(): string {
  if (typeof window === "undefined") return "";
  return (new URLSearchParams(window.location.search).get("ref") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}
