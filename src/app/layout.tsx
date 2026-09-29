import type { Metadata, Viewport } from "next";
import { brandName } from "@/lib/brand";
import { siteUrl } from "@/lib/seo";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ color: "#1d4fd8" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
