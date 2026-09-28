import { prisma } from "./db";
import { AppError } from "./errors";

/** Fixed-window counter in Postgres, so limits hold across several app instances. */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const now = new Date();
  const end = new Date(now.getTime() + windowSec * 1000);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, count, "windowEnd") VALUES (${key}, 1, ${end})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits."windowEnd" < ${now} THEN 1 ELSE rate_limits.count + 1 END,
      "windowEnd" = CASE WHEN rate_limits."windowEnd" < ${now} THEN ${end} ELSE rate_limits."windowEnd" END
    RETURNING count`;
  if (rows[0].count > limit) throw new AppError("Too many attempts. Please wait a few minutes and try again.", 429, "RATE_LIMITED");
}
