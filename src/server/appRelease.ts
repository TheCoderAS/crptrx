import { env } from "./env";

// The Android app files are attached to this repository's GitHub releases by CI
// (.github/workflows/android-build.yml):
//   live (main):    release vX.Y.Z,             file VisionPay-vX.Y.Z.apk,                versionCode X*10000 + Y*100 + Z
//   test (staging): pre-release vX.Y.Z-test.N,  file VisionPay-Test-vX.Y.Z-test.N.apk,    versionCode N
// The live server offers the live app, staging the test app.

export type AppChannel = "live" | "test";
export type AppRelease = { channel: AppChannel; versionName: string; versionCode: number; url: string; size: number; publishedAt: string; pageUrl: string };

type GhRelease = { tag_name: string; prerelease: boolean; draft: boolean; published_at: string; html_url: string; assets: { name: string; size: number; browser_download_url: string }[] };

const LIVE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const TEST_TAG = /^v\d+\.\d+\.\d+-test\.(\d+)$/;

export const appChannel = (): AppChannel => (env.appMode === "LIVE" ? "live" : "test");

/** versionCode for a release tag of a channel, or null if the tag isn't one of that channel's. */
export function versionCodeFor(channel: AppChannel, tag: string): number | null {
  if (channel === "live") {
    const m = LIVE_TAG.exec(tag);
    return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : null;
  }
  const m = TEST_TAG.exec(tag);
  return m ? Number(m[1]) : null;
}

export const apkName = (channel: AppChannel, tag: string) => (channel === "live" ? `VisionPay-${tag}.apk` : `VisionPay-Test-${tag}.apk`);

/** The newest release of a channel that already has its app file attached. */
export function pickLatest(channel: AppChannel, releases: GhRelease[]): AppRelease | null {
  let best: AppRelease | null = null;
  for (const r of releases) {
    if (r.draft || r.prerelease !== (channel === "test")) continue;
    const code = versionCodeFor(channel, r.tag_name);
    const file = r.assets.find((a) => a.name === apkName(channel, r.tag_name));
    if (code === null || !file || (best && best.versionCode >= code)) continue;
    best = { channel, versionName: r.tag_name.slice(1), versionCode: code, url: file.browser_download_url, size: file.size, publishedAt: r.published_at, pageUrl: r.html_url };
  }
  return best;
}

const TTL = 10 * 60_000;
const cache = new Map<AppChannel, { at: number; value: AppRelease | null }>();

/** Latest app file for this server's channel. Cached for 10 minutes; never throws. */
export async function latestAppRelease(channel: AppChannel = appChannel()): Promise<AppRelease | null> {
  const hit = cache.get(channel);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  try {
    const res = await fetch(`https://api.github.com/repos/${env.android.releasesRepo}/releases?per_page=50`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "visionpay-server" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const value = pickLatest(channel, (await res.json()) as GhRelease[]);
    cache.set(channel, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.warn(`[app] couldn't read app releases: ${(e as Error).message}`);
    return hit?.value ?? null;
  }
}
