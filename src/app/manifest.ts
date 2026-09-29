import type { MetadataRoute } from "next";
import { brandName } from "@/lib/brand";
import { getSettings, SETTING_DEFAULTS } from "@/server/settings";

// Built per request so APP_URL and the brand name come from the running server, not the build machine.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const name = await brandName();
  const s = await getSettings().catch(() => SETTING_DEFAULTS);
  return {
    name,
    short_name: name,
    description: "Sell USDT and receive rupees in your own bank account or UPI.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: s.brand_primary_color,
    icons: [
      { src: "/icon", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      { src: "/api/brand/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/brand/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
