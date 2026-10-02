import { redirect } from "next/navigation";

// Merged into Reviews.
export default async function KycQueue({ searchParams }: { searchParams: Promise<{ all?: string; auto?: string }> }) {
  const { all, auto } = await searchParams;
  redirect(auto ? "/admin/reviews?tab=auto" : all ? "/admin/reviews" : "/admin/reviews?tab=kyc");
}
