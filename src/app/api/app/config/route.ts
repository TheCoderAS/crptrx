import { api } from "@/server/http";
import { env } from "@/server/env";
import { appChannel } from "@/server/appRelease";

/**
 * What the Android app needs from this server: the Google sign-in client and the
 * Firebase project for push. Public values only (all of them are in the website too).
 */
export const GET = api(async () => {
  const web = env.firebase.webConfig;
  const sender = env.firebase.messagingSenderId;
  const appId = env.android.firebaseAppId;
  return {
    channel: appChannel(),
    googleClientId: env.android.googleWebClientId ?? null,
    firebase: web && sender && appId ? { apiKey: web.apiKey, projectId: web.projectId, appId, senderId: sender } : null,
  };
});
