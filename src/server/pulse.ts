import { adminCounts, type AdminCounts } from "./adminCounts";
import { prisma } from "./db";

// "Has anything changed?" checks for the browser (src/components/LivePulse.tsx).
// Each is one small query; the page re-renders only when the answer changes.

type Row = Record<string, string | number | Date | null>;
const signature = (r: Row) => Object.values(r).map((v) => (v instanceof Date ? v.getTime() : String(v))).join("|");

/** Admin: the waiting counts plus the newest change to orders, reviews and payments. */
export async function adminPulse(): Promise<{ sig: string; counts: AdminCounts }> {
  const [counts, [r]] = await Promise.all([
    adminCounts(),
    prisma.$queryRaw<Row[]>`
      SELECT
        (SELECT max("updatedAt") FROM orders) AS orders,
        (SELECT max("updatedAt") FROM kyc_submissions) AS kyc,
        (SELECT max(coalesce("reviewedAt", "createdAt")) FROM payout_methods) AS payout,
        (SELECT count(*) FROM incoming_transfers)::int AS transfers,
        (SELECT count(*) FROM support_messages)::int AS support,
        (SELECT max(greatest("lastMessageAt", coalesce("resolvedAt", "lastMessageAt"))) FROM support_threads) AS chats`,
  ]);
  return { sig: `${signature(counts)}|${signature(r)}`, counts };
}

/** Customer: their own orders, identity check, payout methods and the current rate. */
export async function userPulse(userId: string): Promise<{ sig: string }> {
  const [r] = await prisma.$queryRaw<Row[]>`
    SELECT
      (SELECT "updatedAt" FROM users WHERE id = ${userId}) AS account,
      (SELECT max("updatedAt") FROM orders WHERE "userId" = ${userId}) AS orders,
      (SELECT count(*) FROM orders WHERE "userId" = ${userId})::int AS order_count,
      (SELECT max("updatedAt") FROM kyc_submissions WHERE "userId" = ${userId}) AS kyc,
      (SELECT max(coalesce("reviewedAt", "createdAt")) FROM payout_methods WHERE "userId" = ${userId}) AS payout,
      (SELECT "updatedAt" FROM settings WHERE key = 'rate') AS rate,
      (SELECT max("lastMessageAt") FROM support_threads WHERE "userId" = ${userId}) AS chats`;
  return { sig: signature(r) };
}
