import { Banner, PageHeader } from "@/components/ui";

export const metadata = { title: "Terms of service" };

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Terms of service" />
      <Banner tone="info">The final text will be supplied by the company&apos;s lawyer before launch.</Banner>
    </div>
  );
}
