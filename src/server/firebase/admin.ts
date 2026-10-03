import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { env } from "../env";

// The server's own Firebase access (service account). Used for live chat
// signals, chat sign-in tokens and push notifications. Everything here is
// optional: without the key, chat falls back to checking every few seconds and
// no push is sent.

const NAME = "server";

/** The Firebase app, or null when the service account isn't set. */
export function firebaseApp(): App | null {
  const sa = env.firebase.serviceAccount;
  if (!sa) return null;
  if (getApps().some((a) => a.name === NAME)) return getApp(NAME);
  return initializeApp(
    {
      credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
      projectId: sa.project_id,
      databaseURL: env.firebase.databaseUrl,
    },
    NAME,
  );
}

/** Live chat needs the service account, the database address and the web app settings. */
export function liveChatReady(): boolean {
  return !!(env.firebase.serviceAccount && env.firebase.databaseUrl && env.firebase.webConfig);
}

export function logFirebaseError(what: string, e: unknown) {
  console.error(`[firebase] ${what} failed:`, e instanceof Error ? e.message : e);
}
