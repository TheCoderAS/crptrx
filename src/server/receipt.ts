import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import { explorerTxUrl, NETWORK_INFO, type Mode, type NetworkCode } from "@/lib/networks";
import { fmtIST } from "@/lib/time";
import { prisma } from "./db";
import { AppError } from "./errors";
import { D, fmtUsdt } from "./money";
import { maskedPayout, type PayoutSnapshot } from "./payouts";
import { getLogo } from "./brand";
import { companyName } from "./contact";
import { isRealValue, getSettings } from "./settings";

// Standard PDF fonts can't draw the rupee sign, so amounts read "INR 1,234.56" (as banks print them).
const inr = (v: { toString(): string }) => {
  const [i, f] = D(v).toFixed(2).split(".");
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3);
  return `INR ${rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3}.${f}`;
};

const hex = (h: string, fallback = "#2563eb"): RGB => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()) ?? /^#?([0-9a-f]{6})$/i.exec(fallback)!;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
/** Mix a colour with white: t=0 is the colour, t=1 is white. */
const tint = (c: RGB, t: number) => rgb(c.red + (1 - c.red) * t, c.green + (1 - c.green) * t, c.blue + (1 - c.blue) * t);

const INK = rgb(0.06, 0.09, 0.16); // slate-900
const MUTED = rgb(0.39, 0.45, 0.55); // slate-500
const LINE = rgb(0.89, 0.91, 0.94); // slate-200
const GREEN = rgb(0.02, 0.59, 0.41); // emerald-600
const WHITE = rgb(1, 1, 1);

const W = 595;
const H = 842; // A4
const M = 44; // side margin

/** Branded A4 receipt with every field in spec 4.7. Only for PAID orders. */
export async function buildReceipt(orderId: string, userId?: string): Promise<Uint8Array> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
  if (!o || (userId && o.userId !== userId)) throw new AppError("Order not found", 404);
  if (o.status !== "PAID") throw new AppError("A receipt is available once the order is paid.");
  const [s, kyc] = await Promise.all([
    getSettings(),
    prisma.kycSubmission.findFirst({ where: { userId: o.userId, status: "APPROVED" }, orderBy: { reviewedAt: "desc" } }),
  ]);
  const snap = o.payoutSnapshot as unknown as PayoutSnapshot;
  const n = o.network as NetworkCode;
  const brand = hex(s.brand_primary_color);
  const accent = hex(s.brand_accent_color, "#7c3aed");

  const doc = await PDFDocument.create();
  doc.setTitle(`Payment receipt ${o.id}`);
  doc.setAuthor(companyName(s));
  doc.setSubject(`Payment of ${inr(o.paidAmount ?? o.net)} for order ${o.id}`);
  const page = doc.addPage([W, H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const t = new Writer(page, bold);

  // ── Header band ───────────────────────────────────────────────
  const bandH = 116;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: brand });
  page.drawRectangle({ x: 0, y: H - bandH - 4, width: W, height: 4, color: accent });
  // Logo on a white tile (falls back to the first letter of the name).
  const tile = 56;
  const tileY = H - 30 - tile;
  page.drawRectangle({ x: M, y: tileY, width: tile, height: tile, color: WHITE });
  const logo = s.brand_logo_version ? await getLogo() : null;
  if (logo && (logo.mime === "image/png" || logo.mime === "image/jpeg")) {
    const bytes = Buffer.from(logo.data, "base64");
    const img = logo.mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const scale = (tile - 8) / Math.max(img.width, img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: M + (tile - w) / 2, y: tileY + (tile - h) / 2, width: w, height: h });
  } else {
    const ch = companyName(s).trim()[0]?.toUpperCase() ?? "R";
    t.text(ch, M + tile / 2 - bold.widthOfTextAtSize(ch, 26) / 2, tileY + 18, 26, bold, brand);
  }
  const nameX = M + tile + 14;
  t.text(companyName(s), nameX, H - 52, 17, bold, WHITE);
  let hy = H - 67;
  const headerLines = [
    ...(isRealValue(s.company_address) ? s.company_address.split("\n").slice(0, 2) : []),
    [isRealValue(s.company_gstin) && `GSTIN ${s.company_gstin}`, isRealValue(s.company_fiu_reg) && `FIU reg. ${s.company_fiu_reg}`].filter(Boolean).join("   ·   "),
  ].filter(Boolean);
  for (const line of headerLines) {
    t.text(line, nameX, hy, 8, font, tint(brand, 0.75));
    hy -= 11;
  }
  t.right("PAYMENT RECEIPT", W - M, H - 46, 9, bold, tint(brand, 0.7), 1.5);
  t.right(o.id, W - M, H - 64, 14, bold, WHITE);
  t.right(`Issued ${fmtIST(o.paidAt)}`, W - M, H - 80, 8, font, tint(brand, 0.75));

  // ── Amount paid ───────────────────────────────────────────────
  let y = H - bandH - 28;
  const heroH = 92;
  page.drawRectangle({ x: M, y: y - heroH, width: W - 2 * M, height: heroH, color: tint(brand, 0.93), borderColor: tint(brand, 0.8), borderWidth: 0.75 });
  t.text("AMOUNT PAID", M + 18, y - 24, 8, bold, MUTED, 1.2);
  t.text(inr(o.paidAmount ?? o.net), M + 18, y - 52, 26, bold, INK);
  t.text(`to ${snap.holderName} · ${maskedPayout(snap)}`, M + 18, y - 72, 9, font, MUTED);
  // "PAID" stamp.
  const stampW = 104;
  const sx = W - M - 18 - stampW;
  page.drawRectangle({ x: sx, y: y - 66, width: stampW, height: 40, borderColor: GREEN, borderWidth: 1.6, color: rgb(0.93, 0.99, 0.96) });
  t.center("PAID", sx + stampW / 2, y - (o.utr ? 47 : 51), 15, bold, GREEN, 3);
  if (o.utr) t.center(`UTR ${o.utr}`, sx + stampW / 2, y - 60, 6.5, font, GREEN);

  // ── Billed to / Order details ─────────────────────────────────
  y -= heroH + 30;
  const colW = (W - 2 * M - 24) / 2;
  const col2 = M + colW + 24;
  t.label("CUSTOMER", M, y);
  t.label("ORDER", col2, y);
  y -= 8;
  const left: [string, string][] = [
    ["Name", kyc?.fullName ?? o.user.displayName ?? o.user.email],
    ["PAN", kyc?.panMasked ?? "-"],
    ["Email", o.user.email],
  ];
  const right: [string, string][] = [
    ["Order ID", o.id],
    ["Order placed", fmtIST(o.createdAt)],
    ["Paid on", fmtIST(o.paidAt)],
    ...(o.utr ? [["Bank reference (UTR)", o.utr] as [string, string]] : []),
  ];
  const yl = t.pairs(left, M, y, colW, font, bold);
  const yr = t.pairs(right, col2, y, colW, font, bold);
  y = Math.min(yl, yr) - 22;

  // ── USDT received (with a QR to the blockchain record) ───────
  t.label("USDT RECEIVED", M, y);
  y -= 8;
  const qrSize = 78;
  const txUrl = o.txid ? explorerTxUrl(n, o.networkMode as Mode, o.txid) : null;
  const usdtW = W - 2 * M - (txUrl ? qrSize + 20 : 0);
  const usdtTop = y;
  y = t.pairs(
    [
      ["Amount", `${fmtUsdt(o.receivedAmount ?? o.usdtAmount)} USDT`],
      ["Network", NETWORK_INFO[n].name + (o.networkMode === "TEST" ? " (test network)" : "")],
    ],
    M,
    y,
    usdtW,
    font,
    bold,
  );
  if (o.txid) {
    y -= 14;
    t.text("Transaction ID", M, y, 8, font, MUTED);
    y -= 12;
    for (const chunk of wrapChars(o.txid, mono, 8.5, usdtW)) {
      t.text(chunk, M, y, 8.5, mono, INK);
      y -= 11;
    }
  }
  if (txUrl) {
    const png = await QRCode.toBuffer(txUrl, { type: "png", margin: 1, width: 240, errorCorrectionLevel: "M" });
    const qr = await doc.embedPng(png);
    const qx = W - M - qrSize;
    page.drawImage(qr, { x: qx, y: usdtTop - qrSize - 2, width: qrSize, height: qrSize });
    t.center("Scan to verify on", qx + qrSize / 2, usdtTop - qrSize - 13, 6.5, font, MUTED);
    t.center("the blockchain", qx + qrSize / 2, usdtTop - qrSize - 21, 6.5, font, MUTED);
    y = Math.min(y, usdtTop - qrSize - 21);
  }

  // ── Settlement breakdown ──────────────────────────────────────
  y -= 26;
  t.label("SETTLEMENT", M, y);
  y -= 10;
  const rowsBreak: [string, string][] = [
    [`${fmtUsdt(o.receivedAmount ?? o.usdtAmount)} USDT × ${inr(o.rate)}`, inr(o.gross)],
    ...(D(o.taxHeld).gt(0) ? ([[`Tax held back (${D(o.taxPercent).toString()}%)`, `– ${inr(o.taxHeld)}`]] as [string, string][]) : []),
    ...(D(o.fee).gt(0) ? ([[`Platform fee (${D(o.feePercent).toString()}%)`, `– ${inr(o.fee)}`]] as [string, string][]) : []),
    ...(D(o.gstOnFee).gt(0) ? ([[`GST on fee (${D(o.gstPercent).toString()}%)`, `– ${inr(o.gstOnFee)}`]] as [string, string][]) : []),
  ];
  for (const [k, v] of rowsBreak) {
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE });
    y -= 17;
    t.text(k, M, y, 9.5, font, INK);
    t.right(v, W - M, y, 9.5, font, INK);
    y -= 8;
  }
  // Total row.
  page.drawRectangle({ x: M, y: y - 30, width: W - 2 * M, height: 30, color: tint(brand, 0.93) });
  t.text("Net amount paid", M + 12, y - 19, 10.5, bold, INK);
  t.right(inr(o.paidAmount ?? o.net), W - M - 12, y - 19, 12, bold, INK);

  // ── Footer ────────────────────────────────────────────────────
  const fy = 74;
  page.drawLine({ start: { x: M, y: fy + 26 }, end: { x: W - M, y: fy + 26 }, thickness: 0.6, color: LINE });
  t.text("This is a computer-generated receipt and does not need a signature.", M, fy + 10, 8, font, MUTED);
  const help = isRealValue(s.support_email) ? `Questions about this payment? Write to ${s.support_email} with the order ID.` : "Questions about this payment? Contact support from your order page.";
  t.text(help, M, fy - 2, 8, font, MUTED);
  t.text(`${companyName(s)} · ${o.id}`, M, fy - 22, 7, font, tint(MUTED, 0.3));
  page.drawRectangle({ x: 0, y: 0, width: W, height: 6, color: brand });
  return doc.save();
}

/** Split a long unbroken string (a TxID) into lines that fit the width. */
function wrapChars(text: string, f: PDFFont, size: number, width: number): string[] {
  const per = Math.max(10, Math.floor(width / f.widthOfTextAtSize("0", size)));
  return text.match(new RegExp(`.{1,${per}}`, "g")) ?? [text];
}

class Writer {
  constructor(private page: PDFPage, private bold: PDFFont) {}
  text(s: string, x: number, y: number, size: number, f: PDFFont, color: RGB, spacing = 0) {
    if (!spacing) return void this.page.drawText(s, { x, y, size, font: f, color });
    // pdf-lib has no letter spacing: draw letter by letter.
    for (const ch of s) {
      this.page.drawText(ch, { x, y, size, font: f, color });
      x += f.widthOfTextAtSize(ch, size) + spacing;
    }
  }
  width(s: string, size: number, f: PDFFont, spacing = 0) {
    return f.widthOfTextAtSize(s, size) + spacing * Math.max(0, s.length - 1);
  }
  right(s: string, xRight: number, y: number, size: number, f: PDFFont, color: RGB, spacing = 0) {
    this.text(s, xRight - this.width(s, size, f, spacing), y, size, f, color, spacing);
  }
  center(s: string, xMid: number, y: number, size: number, f: PDFFont, color: RGB, spacing = 0) {
    this.text(s, xMid - this.width(s, size, f, spacing) / 2, y, size, f, color, spacing);
  }
  label(s: string, x: number, y: number) {
    this.text(s, x, y, 7.5, this.bold, MUTED, 1.2);
  }
  /** Label above value, one pair per line. Returns the y below the last pair. */
  pairs(rows: [string, string][], x: number, y: number, width: number, f: PDFFont, b: PDFFont): number {
    for (const [k, v] of rows) {
      y -= 14;
      this.text(k, x, y, 8, f, MUTED);
      y -= 13;
      let val = v;
      while (val.length > 1 && b.widthOfTextAtSize(val, 10) > width) val = val.slice(0, -2) + "…";
      this.text(val, x, y, 10, b, INK);
    }
    return y;
  }
}
