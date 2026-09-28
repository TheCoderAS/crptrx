import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../env";
import { AppError } from "../errors";

// Firebase ID tokens are verified against Google's public keys. Only the
// project ID is needed server-side; no service-account key is stored.
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export interface FirebaseIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  provider?: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseIdentity> {
  const projectId = env.firebase.projectId;
  if (!projectId) throw new AppError("Google sign-in is not configured.", 503);
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ["RS256"],
    }));
  } catch {
    throw new AppError("Sign-in failed. Please try again.", 401);
  }
  if (!payload.sub || typeof payload.email !== "string") throw new AppError("Your Google account has no email address.", 401);
  const fb = payload.firebase as { sign_in_provider?: string } | undefined;
  return {
    uid: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : undefined,
    provider: fb?.sign_in_provider,
  };
}
