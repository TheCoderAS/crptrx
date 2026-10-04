import { env } from "./env";

// The Android app files are attached to this repository's GitHub releases by CI
// (.github/workflows/android-build.yml):
//   live (main):    release vX.Y.Z,             file VisionPay-vX.Y.Z.apk,                versionCode X*10000 + Y*100 + Z
//   test (staging): pre-release vX.Y.Z-test.N,  file VisionPay-Test-vX.Y.Z-test.N.apk,    versionCode N
// After each build CI also writes latest-<channel>.json to the "app-latest" release (read first).
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
const FAIL_TTL = 2 * 60_000;
const cache = new Map<AppChannel, { at: number; ttl: number; value: AppRelease | null }>();

/** Where CI keeps the newest file's details: a plain download, so no GitHub API rate limit applies. */
export const manifestUrl = (channel: AppChannel) => `https://github.com/${env.android.releasesRepo}/releases/download/${MANIFEST_TAG}/latest-${channel}.json`;
export const MANIFEST_TAG = "app-latest";

/** A manifest written by CI, checked before it's trusted. */
export function parseManifest(channel: AppChannel, m: unknown): AppRelease | null {
  const r = m as Partial<AppRelease> | null;
  if (!r || r.channel !== channel || typeof r.versionName !== "string" || typeof r.url !== "string" || !r.url.startsWith("https://github.com/")) return null;
  if (versionCodeFor(channel, `v${r.versionName}`) !== r.versionCode) return null;
  return { channel, versionName: r.versionName, versionCode: r.versionCode, url: r.url, size: Number(r.size) || 0, publishedAt: String(r.publishedAt ?? ""), pageUrl: String(r.pageUrl ?? "") };
}

async function fromManifest(channel: AppChannel): Promise<AppRelease | null> {
  const res = await fetch(manifestUrl(channel), { headers: { "user-agent": "visionpay-server" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  return parseManifest(channel, await res.json());
}

/** Fallback: the releases list (60 requests an hour per server address without GITHUB_TOKEN). */
async function fromApi(channel: AppChannel): Promise<AppRelease | null> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${env.android.releasesRepo}/releases?per_page=50`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "visionpay-server", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return pickLatest(channel, (await res.json()) as GhRelease[]);
}

/** Latest app file for this server's channel. Cached (10 min, 2 min after a failure); never throws. */
export async function latestAppRelease(channel: AppChannel = appChannel()): Promise<AppRelease | null> {
  const hit = cache.get(channel);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;
  let value: AppRelease | null = null;
  let failed = false;
  try {
    value = await fromManifest(channel);
  } catch (e) {
    console.warn(`[app] couldn't read the app manifest: ${(e as Error).message}`);
    failed = true;
  }
  if (!value) {
    try {
      value = await fromApi(channel);
      failed = false;
    } catch (e) {
      console.warn(`[app] couldn't read app releases: ${(e as Error).message}`);
      failed = true;
    }
  }
  // On failure keep showing what we knew, and try again soon rather than on every visit.
  if (failed && !value) value = hit?.value ?? null;
  cache.set(channel, { at: Date.now(), ttl: failed ? FAIL_TTL : TTL, value });
  return value;
}

export function clearAppReleaseCacheForTests() {
  cache.clear();
}
