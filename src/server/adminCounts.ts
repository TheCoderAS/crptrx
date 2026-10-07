import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { isSuper, type Viewer } from "./scope";

export type AdminCounts = {
  work: number;
  kyc: number;
  kycSubmitted: number;
  kycAuto: number;
  payout: number;
  reviews: number;
  unmatched: number;
  support: number;
  /** Super admin: approved orders waiting for the payout to be sent. */
  toPay: number;
};

/**
 * Everything waiting on an admin, in one database round trip (the admin menu
 * shows these on every page, and the browser re-checks them every 20 s).
 * Same rules as the queues: see the Orders, Reviews, Unmatched and Support pages.
 * An admin counts only their own customers (scope.ts). The menu and the dashboard
 * share one read per page render (React cache).
 */
export const adminCounts = (v: Viewer) => countsFor(v.id, v.role);

const countsFor = cache(async (id: string, role: Viewer["role"]): Promise<AdminCounts> => {
  const v = { id, role };
  const sup = isSuper(v);
  // Approved orders wait for a super admin to send the money, so they're not an admin's work.
  const work = sup ? Prisma.sql`('PAYMENT_CONFIRMED', 'UNDER_REVIEW', 'ON_HOLD', 'APPROVED')` : Prisma.sql`('PAYMENT_CONFIRMED', 'UNDER_REVIEW', 'ON_HOLD')`;
  // Rows whose customer ("userId") this viewer may see.
  const mine = sup ? Prisma.sql`TRUE` : Prisma.sql`"userId" IN (SELECT id FROM users WHERE "adminId" = ${v.id})`;
  const [r] = await prisma.$queryRaw<{ work: number; kyc_submitted: number; kyc_auto: number; payout: number; unmatched: number; support: number; to_pay: number }[]>`
    SELECT
      (SELECT count(*) FROM orders WHERE status IN ${work} AND ${mine})::int AS work,
      (SELECT count(*) FROM kyc_submissions WHERE status = 'SUBMITTED' AND ${mine})::int AS kyc_submitted,
      (SELECT count(*) FROM kyc_submissions WHERE "autoApproved" AND "postReviewedAt" IS NULL AND status = 'APPROVED' AND ${mine})::int AS kyc_auto,
      (SELECT count(*) FROM payout_methods WHERE status = 'PENDING' AND "deletedAt" IS NULL AND ${mine})::int AS payout,
      ${sup ? Prisma.sql`(SELECT count(*) FROM incoming_transfers WHERE status = 'UNMATCHED')::int` : Prisma.sql`0`} AS unmatched,
      ((SELECT count(*) FROM support_threads WHERE status = 'OPEN' AND "lastFrom" = 'USER' AND ${mine})
        + (SELECT count(*) FROM support_messages WHERE "orderId" IS NULL AND handled = false AND ${mine}))::int AS support,
      ${sup ? Prisma.sql`(SELECT count(*) FROM orders WHERE status = 'APPROVED')::int` : Prisma.sql`0`} AS to_pay`;
  const kyc = r.kyc_submitted + r.kyc_auto;
  return {
    work: r.work,
    kyc,
    kycSubmitted: r.kyc_submitted,
    kycAuto: r.kyc_auto,
    payout: r.payout,
    reviews: kyc + r.payout,
    unmatched: r.unmatched,
    support: r.support,
    toPay: r.to_pay,
  };
});
