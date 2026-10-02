import { redirect } from "next/navigation";

// Merged into Reviews.
export default function PayoutQueue() {
  redirect("/admin/reviews?tab=payout");
}
