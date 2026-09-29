import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";
import { getSettings } from "@/server/settings";

// Built per request so APP_URL and the brand name come from the running server, not the build machine.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const s = await getSettings().catch(() => null);
  const legal = { terms: !!s?.terms_text, privacy: !!s?.privacy_text }; // listed once the text exists
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/help`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    ...(legal.terms ? [{ url: `${base}/terms`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.3 }] : []),
    ...(legal.privacy ? [{ url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.3 }] : []),
  ];
}
