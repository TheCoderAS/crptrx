import { Banner, PageHeader } from "@/components/ui";

export const metadata = { title: "Privacy policy", description: "How we collect, store and protect your identity documents and personal data.", alternates: { canonical: "/privacy" } };

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Privacy policy" />
      <Banner tone="info">The final text will be supplied by the company&apos;s lawyer before launch.</Banner>
    </div>
  );
}
