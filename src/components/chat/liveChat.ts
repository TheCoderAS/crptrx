"use client";

import type { FirebaseApp } from "firebase/app";
import type { Database } from "firebase/database";

// Firebase sign-in for live chat, shared by every chat on the page. Kept apart
// from Google sign-in (its own app name, signed in only for this tab), so it
// never touches how people log in.

type Side = "USER" | "ADMIN";
type Live = { db: Database; app: FirebaseApp };

let current: { side: Side; promise: Promise<Live | null> } | null = null;

async function connect(side: Side): Promise<Live | null> {
  const res = await fetch(side === "USER" ? "/api/chat/token" : "/api/admin/chat/token", { method: "POST" });
  if (!res.ok) return null;
  const d = (await res.json()) as { live: boolean; token?: string; config?: Record<string, string> };
  if (!d.live || !d.token || !d.config) return null;
  const [{ initializeApp, getApps, deleteApp }, { initializeAuth, inMemoryPersistence, signInWithCustomToken }, { getDatabase }] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/database"),
  ]);
  const name = `chat-${side}`;
  const old = getApps().find((a) => a.name === name);
  if (old) await deleteApp(old);
  const app = initializeApp(d.config, name);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  await signInWithCustomToken(auth, d.token);
  return { app, db: getDatabase(app) };
}

/** Live connection for this side, or null: then the chat checks every few seconds instead. */
export function liveChat(side: Side): Promise<Live | null> {
  if (!current || current.side !== side) {
    const promise = connect(side).catch(() => null);
    current = { side, promise };
    // A failure (offline, Firebase down) is retried on the next chat that opens.
    void promise.then((l) => {
      if (!l && current?.promise === promise) current = null;
    });
  }
  return current.promise;
}

/** Sign out of live chat (on log out), so the next person in this tab starts clean. */
export async function endLiveChat() {
  const c = current;
  current = null;
  const live = await c?.promise.catch(() => null);
  if (live) {
    const { deleteApp } = await import("firebase/app");
    await deleteApp(live.app).catch(() => undefined);
  }
}
