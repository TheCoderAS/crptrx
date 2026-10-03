import { env } from "../env";
import { AppError } from "../errors";

/**
 * The Android app signs in with the phone's Google account and gets a Google ID
 * token. Firebase turns it into the same Firebase ID token (same user ID) the
 * website's Google button produces, so app and website share one account.
 */
export async function firebaseIdTokenFromGoogle(googleIdToken: string): Promise<string> {
  const cfg = env.firebase.webConfig;
  if (!cfg) throw new AppError("Google sign-in is not configured.", 503);
  if (googleIdToken.length < 100 || googleIdToken.length > 8192) throw new AppError("Sign-in failed. Please try again.", 400);
  let res: Response;
  try {
    res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: "POST",
      // A browser key limited to our website's address still works from here.
      headers: { "content-type": "application/json", referer: `${env.appUrl.replace(/\/+$/, "")}/` },
      body: JSON.stringify({
        postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
        requestUri: env.appUrl,
        returnSecureToken: true,
        returnIdpCredential: true,
      }),
    });
  } catch {
    throw new AppError("Couldn't reach Google. Please try again.", 503);
  }
  const data = (await res.json().catch(() => ({}))) as { idToken?: unknown; error?: { message?: string } };
  if (!res.ok || typeof data.idToken !== "string") {
    console.warn(`[auth] app Google sign-in refused by Firebase: ${data.error?.message ?? res.status}`);
    throw new AppError("Sign-in failed. Please try again.", 401);
  }
  return data.idToken;
}
