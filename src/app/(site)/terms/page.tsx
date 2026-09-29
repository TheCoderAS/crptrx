import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { LegalPage } from "@/components/LegalPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings().catch(() => null);
  // Kept out of search results until the real text is entered (Admin → Settings → Messages).
  return { title: "Terms of service", description: "Terms for using the service to sell USDT for INR.", alternates: { canonical: "/terms" }, robots: { index: !!s?.terms_text, follow: true } };
}

export default async function Page() {
  const s = await getSettings();
  return <LegalPage title="Terms of service" text={s.terms_text} />;
}
