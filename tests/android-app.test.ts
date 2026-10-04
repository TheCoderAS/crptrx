import { afterEach, describe, expect, it, vi } from "vitest";
import { apkName, clearAppReleaseCacheForTests, latestAppRelease, manifestUrl, parseManifest, pickLatest, versionCodeFor } from "@/server/appRelease";
import { firebaseIdTokenFromGoogle } from "@/server/auth/googleNative";

const rel = (tag: string, prerelease: boolean, assets: string[] = [], published = "2026-10-03T10:00:00Z") => ({
  tag_name: tag,
  prerelease,
  draft: false,
  published_at: published,
  html_url: `https://github.com/x/y/releases/tag/${tag}`,
  assets: assets.map((name) => ({ name, size: 4_000_000, browser_download_url: `https://github.com/x/y/releases/download/${tag}/${name}` })),
});

describe("app release versions (must match .github/workflows/android-build.yml)", () => {
  it("live: vX.Y.Z -> X*10000+Y*100+Z; test: vX.Y.Z-test.N -> N", () => {
    expect(versionCodeFor("live", "v1.2.0")).toBe(10200);
    expect(versionCodeFor("live", "v2.10.3")).toBe(21003);
    expect(versionCodeFor("live", "v1.3.0-test.7")).toBeNull();
    expect(versionCodeFor("test", "v1.3.0-test.7")).toBe(7);
    expect(versionCodeFor("test", "v1.3.0")).toBeNull();
    expect(apkName("live", "v1.2.0")).toBe("VisionPay-v1.2.0.apk");
    expect(apkName("test", "v1.3.0-test.7")).toBe("VisionPay-Test-v1.3.0-test.7.apk");
  });

  it("picks the newest release of the channel that already has its app file", () => {
    const releases = [
      rel("v1.3.0", false), // just tagged, app file still building
      rel("v1.2.0", false, ["VisionPay-v1.2.0.apk"]),
      rel("v1.1.0", false, ["VisionPay-v1.1.0.apk"]),
      rel("v1.3.0-test.9", true, ["VisionPay-Test-v1.3.0-test.9.apk"]),
      rel("v1.3.0-test.12", true, ["VisionPay-Test-v1.3.0-test.12.apk"]),
      rel("v1.3.0-test.11", true, ["something-else.apk"]),
    ];
    expect(pickLatest("live", releases)).toMatchObject({ versionName: "1.2.0", versionCode: 10200, url: expect.stringContaining("VisionPay-v1.2.0.apk") });
    expect(pickLatest("test", releases)).toMatchObject({ versionName: "1.3.0-test.12", versionCode: 12, channel: "test" });
    expect(pickLatest("live", [rel("v1.0.0", false)])).toBeNull();
  });
});

describe("Google sign-in from the app", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("swaps the Google ID token for a Firebase one", async () => {
    vi.stubEnv("FIREBASE_API_KEY", "test-key");
    vi.stubEnv("FIREBASE_PROJECT_ID", "demo-project");
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ idToken: "firebase-id-token" }), { status: 200 });
    });
    expect(await firebaseIdTokenFromGoogle("g".repeat(200))).toBe("firebase-id-token");
    expect(calls[0].url).toContain("accounts:signInWithIdp?key=test-key");
    expect(calls[0].body.postBody).toBe(`id_token=${"g".repeat(200)}&providerId=google.com`);
  });

  it("refuses junk and reports Firebase refusals as a failed sign-in", async () => {
    vi.stubEnv("FIREBASE_API_KEY", "test-key");
    vi.stubEnv("FIREBASE_PROJECT_ID", "demo-project");
    await expect(firebaseIdTokenFromGoogle("short")).rejects.toMatchObject({ status: 400 });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "INVALID_IDP_RESPONSE" } }), { status: 400 }));
    await expect(firebaseIdTokenFromGoogle("g".repeat(200))).rejects.toMatchObject({ status: 401 });
  });
});

describe("finding the newest app file", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAppReleaseCacheForTests();
  });
  const manifest = { channel: "test", versionName: "1.3.0-test.7", versionCode: 7, url: "https://github.com/x/y/releases/download/v1.3.0-test.7/VisionPay-Test-v1.3.0-test.7.apk", size: 2_300_000, publishedAt: "2026-10-04T06:00:00Z", pageUrl: "https://github.com/x/y/releases/tag/v1.3.0-test.7" };

  it("trusts only a manifest that matches its channel and version rules", () => {
    expect(parseManifest("test", manifest)).toMatchObject({ versionCode: 7 });
    expect(parseManifest("live", manifest)).toBeNull();
    expect(parseManifest("test", { ...manifest, versionCode: 8 })).toBeNull();
    expect(parseManifest("test", { ...manifest, url: "https://evil.example/app.apk" })).toBeNull();
  });

  it("reads the manifest (a plain download, no API limit) and caches it", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(manifest), { status: 200 });
    });
    expect(await latestAppRelease("test")).toMatchObject({ versionName: "1.3.0-test.7" });
    expect(await latestAppRelease("test")).toMatchObject({ versionName: "1.3.0-test.7" });
    expect(urls).toEqual([manifestUrl("test")]);
    expect(urls[0]).toContain("/releases/download/app-latest/latest-test.json");
  });

  it("falls back to the releases list, and a GitHub refusal shows nothing rather than an error", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("api.github.com")
        ? new Response(JSON.stringify([rel("v1.3.0-test.5", true, ["VisionPay-Test-v1.3.0-test.5.apk"])]), { status: 200 })
        : new Response("Not Found", { status: 404 }),
    );
    expect(await latestAppRelease("test")).toMatchObject({ versionCode: 5 });
    clearAppReleaseCacheForTests();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "API rate limit exceeded" }), { status: 403 }));
    expect(await latestAppRelease("test")).toBeNull();
  });
});
