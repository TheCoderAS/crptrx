import { cache } from "react";
import { prisma } from "./db";

export type AdminCounts = { work: number; kyc: number; kycSubmitted: number; kycAuto: number; payout: number; reviews: number; unmatched: number; support: number };

/**
 * Everything waiting on an admin, in one database round trip (the admin menu
 * shows these on every page, and the browser re-checks them every 20 s).
 * Same rules as the queues: see the Orders, Reviews, Unmatched and Support pages.
 * The menu and the dashboard share one read per page render (React cache).
 */
export const adminCounts = cache(async (): Promise<AdminCounts> => {
  const [r] = await prisma.$queryRaw<{ work: number; kyc_submitted: number; kyc_auto: number; payout: number; unmatched: number; support: number }[]>`
    SELECT
      (SELECT count(*) FROM orders WHERE status IN ('PAYMENT_CONFIRMED', 'UNDER_REVIEW', 'ON_HOLD', 'APPROVED'))::int AS work,
      (SELECT count(*) FROM kyc_submissions WHERE status = 'SUBMITTED')::int AS kyc_submitted,
      (SELECT count(*) FROM kyc_submissions WHERE "autoApproved" AND "postReviewedAt" IS NULL AND status = 'APPROVED')::int AS kyc_auto,
      (SELECT count(*) FROM payout_methods WHERE status = 'PENDING' AND "deletedAt" IS NULL)::int AS payout,
      (SELECT count(*) FROM incoming_transfers WHERE status = 'UNMATCHED')::int AS unmatched,
      ((SELECT count(*) FROM support_threads WHERE status = 'OPEN' AND "lastFrom" = 'USER')
        + (SELECT count(*) FROM support_messages WHERE "orderId" IS NULL AND handled = false))::int AS support`;
  const kyc = r.kyc_submitted + r.kyc_auto;
  return { work: r.work, kyc, kycSubmitted: r.kyc_submitted, kycAuto: r.kyc_auto, payout: r.payout, reviews: kyc + r.payout, unmatched: r.unmatched, support: r.support };
});
