import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { LegalPage } from "@/components/LegalPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings().catch(() => null);
  // Kept out of search results until the real text is entered (Admin → Settings → Messages).
  return { title: "Privacy policy", description: "How we collect, store and protect your identity documents and personal data.", alternates: { canonical: "/privacy" }, robots: { index: !!s?.privacy_text, follow: true } };
}

export default async function Page() {
  const s = await getSettings();
  return <LegalPage title="Privacy policy" text={s.privacy_text} />;
}
