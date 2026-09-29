import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

// Built per request so APP_URL and the brand name come from the running server, not the build machine.
export const dynamic = "force-dynamic";

/** Public pages only. Private and admin areas are never indexed. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/dashboard", "/account", "/kyc", "/payout-methods", "/sell", "/orders"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
