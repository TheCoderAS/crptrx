import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { prisma } from "./db";
import { AppError } from "./errors";
import { D, fmtUsdt } from "./money";
import { maskedPayout, type PayoutSnapshot } from "./payouts";
import { getSettings } from "./settings";

// Standard PDF fonts can't draw the rupee sign, so amounts read "INR 1,234.56".
const inr = (v: { toString(): string }) => {
  const [i, f] = D(v).toFixed(2).split(".");
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3);
  return `INR ${rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3}.${f}`;
};

/** Receipt with every field in spec 4.7. Only for PAID orders. */
export async function buildReceipt(orderId: string, userId?: string): Promise<Uint8Array> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
  if (!o || (userId && o.userId !== userId)) throw new AppError("Order not found", 404);
  if (o.status !== "PAID") throw new AppError("A receipt is available once the order is paid.");
  const [s, kyc] = await Promise.all([
    getSettings(),
    prisma.kycSubmission.findFirst({ where: { userId: o.userId, status: "APPROVED" }, orderBy: { reviewedAt: "desc" } }),
  ]);
  const snap = o.payoutSnapshot as unknown as PayoutSnapshot;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 790;
  const text = (t: string, x: number, size = 10, f = font) => page.drawText(t, { x, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  text(s.company_name, 50, 16, bold);
  y -= 18;
  for (const line of s.company_address.split("\n")) {
    text(line, 50, 9);
    y -= 12;
  }
  text(`FIU registration no.: ${s.company_fiu_reg}   GSTIN: ${s.company_gstin}`, 50, 9);
  y -= 30;
  text("Payment receipt", 50, 14, bold);
  y -= 24;
  const rows: [string, string][] = [
    ["Order ID", o.id],
    ["Order date", fmtIST(o.createdAt)],
    ["Name", kyc?.fullName ?? o.user.displayName ?? o.user.email],
    ["PAN", kyc?.panMasked ?? "-"],
    ["USDT received", `${fmtUsdt(o.receivedAmount ?? o.usdtAmount)} USDT`],
    ["Network", NETWORK_INFO[o.network as NetworkCode].name],
    ["Transaction ID", o.txid ?? "-"],
    ["Rate", `${inr(o.rate).replace("INR ", "INR ")} per USDT`.replace(/\.00 per/, " per")],
    ["Gross amount", inr(o.gross)],
    [`Tax held back (${D(o.taxPercent).toString()}%)`, inr(o.taxHeld)],
    [`Platform fee (${D(o.feePercent).toString()}%)`, inr(o.fee)],
    ...(D(o.gstOnFee).gt(0) ? ([[`GST on fee (${D(o.gstPercent).toString()}%)`, inr(o.gstOnFee)]] as [string, string][]) : []),
    ["Net amount paid", inr(o.paidAmount ?? o.net)],
    ["Paid to", maskedPayout(snap)],
    ["Bank reference (UTR)", o.utr ?? "-"],
    ["Paid on", fmtIST(o.paidAt)],
  ];
  for (const [k, v] of rows) {
    text(k, 50, 10, bold);
    // Long values (TxID) wrap.
    const chunks = v.match(/.{1,60}/g) ?? [v];
    chunks.forEach((c, i) => {
      if (i > 0) y -= 13;
      text(c, 220, 10);
    });
    y -= 18;
  }
  y -= 20;
  text("This receipt is generated electronically and does not need a signature.", 50, 8);
  return doc.save();
}
