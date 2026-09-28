import { api, body } from "@/server/http";
import { adminCtx, recheck2fa } from "@/server/auth/guard";
import { AppError } from "@/server/errors";
import { exportReport, parseRange } from "@/server/reports";

export const POST = api(async (req: Request) => {
  const a = await adminCtx("SUPER_ADMIN");
  const b = await body<Record<string, string>>(req);
  if (!["orders", "tax", "audit"].includes(b.kind)) throw new AppError("Choose a report.");
  await recheck2fa(a, b.totp, "report_export");
  const range = parseRange(b.from, b.to);
  const csv = await exportReport(b.kind as "orders" | "tax" | "audit", range, a.actor, a.ip);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${b.kind}-${b.from ?? "last30"}-${b.to ?? "today"}.csv"`,
      "cache-control": "no-store",
    },
  });
});
