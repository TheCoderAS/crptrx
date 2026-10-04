"use client";

// An invite link (/signup?ref=CODE) is remembered on this device for 30 days, so the
// code is still filled in if the person signs up later.
const KEY = "invite-code";
const KEEP_MS = 30 * 24 * 3600_000;

export function rememberedInvite(): string {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { code: string; at: number } | null;
    if (v && Date.now() - v.at < KEEP_MS) return v.code;
  } catch {
    /* no storage */
  }
  return "";
}

export function rememberInvite(code: string) {
  try {
    if (code) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

/** ?ref=CODE from the current address, cleaned up. */
export function inviteFromUrl(): string {
  if (typeof window === "undefined") return "";
  return (new URLSearchParams(window.location.search).get("ref") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}
