import type { Metadata, Viewport } from "next";
import { brandName } from "@/lib/brand";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import { themeCss } from "@/server/brand";
import { getSettings, SETTING_DEFAULTS } from "@/server/settings";
import { siteUrl } from "@/lib/seo";
import { Toaster } from "@/components/Toaster";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const name = await brandName();
  const description = "Sell USDT and receive rupees in your own bank account or UPI. Exact quote, 15-minute price lock, TDS handled, receipt with bank reference.";
  return {
    metadataBase: new URL(siteUrl()),
    applicationName: name,
    title: { default: `${name}: sell USDT for INR`, template: `%s | ${name}` },
    description,
    keywords: ["sell USDT", "USDT to INR", "USDT to rupees", "crypto to bank India", "TRC-20 USDT", "BEP-20 USDT", "USDT UPI", "sell tether India"],
    openGraph: { type: "website", locale: "en_IN", siteName: name, title: `${name}: sell USDT for INR`, description, url: "/" },
    twitter: { card: "summary_large_image", title: `${name}: sell USDT for INR`, description },
    robots: { index: true, follow: true },
    formatDetection: { telephone: false },
  };
}

async function brandSettings() {
  try {
    return await getSettings();
  } catch {
    return SETTING_DEFAULTS; // database not reachable (e.g. at build time)
  }
}

export async function generateViewport(): Promise<Viewport> {
  const s = await brandSettings();
  return { width: "device-width", initialScale: 1, themeColor: [{ color: s.brand_primary_color }] };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await brandSettings();
  return (
    // data-theme is set by THEME_SCRIPT before React loads, hence suppressHydrationWarning.
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Admin-chosen colours (Settings → Brand) */}
        <style dangerouslySetInnerHTML={{ __html: themeCss(s) }} />
      </head>
      <body className="min-h-screen">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
