import type { MetadataRoute } from "next";
import { brandName } from "@/lib/brand";

// Built per request so APP_URL and the brand name come from the running server, not the build machine.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const name = await brandName();
  return {
    name,
    short_name: name,
    description: "Sell USDT and receive rupees in your own bank account or UPI.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1d4fd8",
    icons: [
      { src: "/icon", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
