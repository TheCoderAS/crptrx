import { env } from "@/server/env";

/**
 * Android App Links: tells Android that our app may open links to this website, so an
 * invite or order link opens in the app (when installed) instead of the browser.
 * Each website vouches for its own app: live for the live site, the test app for staging.
 * https://developer.android.com/training/app-links/verify-android-applinks
 */
export const dynamic = "force-dynamic";

const PACKAGES = { LIVE: ["com.visionpay.live.app"], TEST: ["com.visionpay.live.app.test"] } as const;

export function GET() {
  const mode = env.appMode;
  const packages = mode ? PACKAGES[mode] : [...PACKAGES.LIVE, ...PACKAGES.TEST];
  const body = packages.map((package_name) => ({
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name, sha256_cert_fingerprints: env.android.certSha256 },
  }));
  return Response.json(body, { headers: { "cache-control": "public, max-age=3600" } });
}
