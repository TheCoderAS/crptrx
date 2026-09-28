import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { audit, type Actor } from "./audit";
import { prisma } from "./db";
import { AppError } from "./errors";
import { D } from "./money";
import { decrypt } from "./crypto";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  // Quote everything; neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export function parseRange(from?: string | null, to?: string | null) {
  const f = from ? new Date(`${from}T00:00:00+05:30`) : new Date(Date.now() - 30 * 86400_000);
  const t = to ? new Date(`${to}T23:59:59.999+05:30`) : new Date();
  if (isNaN(f.getTime()) || isNaN(t.getTime()) || f > t) throw new AppError("Choose a valid date range.");
  return { from: f, to: t };
}

async function kycMap(userIds: string[]) {
  const subs = await prisma.kycSubmission.findMany({ where: { userId: { in: userIds }, status: "APPROVED" }, orderBy: { reviewedAt: "asc" } });
  return new Map(subs.map((s) => [s.userId, s]));
}

/** Requires a fresh 2FA check by the caller (spec 10.4). */
export async function exportReport(kind: "orders" | "tax" | "audit", range: { from: Date; to: Date }, actor: Actor, ip: string | null): Promise<string> {
  await audit(actor, "REPORT_EXPORTED", { details: { kind, from: range.from.toISOString(), to: range.to.toISOString() }, ip });
  if (kind === "orders") {
    const orders = await prisma.order.findMany({ where: { createdAt: { gte: range.from, lte: range.to } }, orderBy: { createdAt: "asc" } });
    const kyc = await kycMap([...new Set(orders.map((o) => o.userId))]);
    const rows: unknown[][] = [["order_id", "created_at", "paid_at", "user_name", "pan", "usdt", "network", "txid", "rate", "gross_inr", "tax_held_inr", "fee_inr", "gst_inr", "net_inr", "utr", "status"]];
    for (const o of orders) {
      const k = kyc.get(o.userId);
      rows.push([o.id, o.createdAt, o.paidAt, k?.fullName, k ? decrypt(k.panEncrypted) : "", D(o.usdtAmount).toFixed(), NETWORK_INFO[o.network as NetworkCode].name, o.txid, D(o.rate).toFixed(), D(o.gross).toFixed(2), D(o.taxHeld).toFixed(2), D(o.fee).toFixed(2), D(o.gstOnFee).toFixed(2), D(o.net).toFixed(2), o.utr, o.status]);
    }
    return csv(rows);
  }
  if (kind === "tax") {
    // Per user per month (IST), PAID orders only: gross and tax held (for the CA).
    const rows = await prisma.$queryRaw<{ user_id: string; month: string; gross: string; tax_held: string; orders: bigint }[]>`
      SELECT "userId" AS user_id, to_char("paidAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month,
             SUM(gross)::text AS gross, SUM("taxHeld")::text AS tax_held, COUNT(*) AS orders
      FROM orders WHERE status = 'PAID' AND "paidAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY 1, 2 ORDER BY 2, 1`;
    const kyc = await kycMap([...new Set(rows.map((r) => r.user_id))]);
    return csv([
      ["month", "user_name", "pan", "orders", "gross_inr", "tax_held_inr"],
      ...rows.map((r) => {
        const k = kyc.get(r.user_id);
        return [r.month, k?.fullName, k ? decrypt(k.panEncrypted) : "", Number(r.orders), D(r.gross).toFixed(2), D(r.tax_held).toFixed(2)];
      }),
    ]);
  }
  const logs = await prisma.auditLog.findMany({ where: { createdAt: { gte: range.from, lte: range.to } }, orderBy: { createdAt: "asc" } });
  const events = await prisma.orderEvent.findMany({ where: { createdAt: { gte: range.from, lte: range.to } }, orderBy: { createdAt: "asc" } });
  return csv([
    ["time", "source", "actor_type", "actor_id", "action", "target", "details"],
    ...logs.map((l) => [l.createdAt, "audit_log", l.actorType, l.actorId, l.action, `${l.targetType ?? ""}:${l.targetId ?? ""}`, JSON.stringify(l.details ?? {})]),
    ...events.map((e) => [e.createdAt, "order_events", e.actorType, e.actorId, `${e.fromStatus ?? "NEW"} -> ${e.toStatus}`, `order:${e.orderId}`, JSON.stringify({ public: e.publicMessage, private: e.privateNote })]),
  ]);
}
