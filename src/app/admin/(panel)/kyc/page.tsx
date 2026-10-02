import { redirect } from "next/navigation";

// Merged into Reviews.
export default async function KycQueue({ searchParams }: { searchParams: Promise<{ all?: string; auto?: string }> }) {
  const { all, auto } = await searchParams;
  redirect(`/admin/reviews?tab=${auto ? "auto" : all ? "history" : "kyc"}`);
}
