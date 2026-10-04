import Decimal from "decimal.js";

// Exact decimal math only. Rupees round to paise, half-up (spec 7.1).
Decimal.set({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
export { Decimal };

export type DecimalLike = Decimal | string | number | { toString(): string };
export const D = (v: DecimalLike) => new Decimal(v.toString());

export const rupees = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export interface PayoutInput {
  usdt: DecimalLike;
  rate: DecimalLike; // INR per USDT
  taxPercent: DecimalLike; // e.g. 1 for 1%
  feePercent: DecimalLike;
  gstEnabled: boolean;
  gstPercent: DecimalLike; // e.g. 18
  /** Optional flat limits on the fee in rupees. Empty or missing = no limit. */
  feeMin?: DecimalLike | null;
  feeMax?: DecimalLike | null;
}

export interface PayoutBreakdown {
  gross: Decimal;
  taxHeld: Decimal;
  fee: Decimal;
  gstOnFee: Decimal;
  net: Decimal;
}

/** A fee limit as a number, or null when it isn't set (empty string, null, undefined). */
export function feeLimit(v: DecimalLike | null | undefined): Decimal | null {
  if (v === null || v === undefined) return null;
  const s = v.toString().trim();
  return s === "" ? null : D(s);
}

/** Fee = gross x fee%, raised to the minimum and capped at the maximum when those are set. */
export function feeFor(gross: Decimal, i: Pick<PayoutInput, "feePercent" | "feeMin" | "feeMax">): Decimal {
  let fee = rupees(gross.mul(D(i.feePercent)).div(100));
  const min = feeLimit(i.feeMin);
  const max = feeLimit(i.feeMax);
  if (min && fee.lt(min)) fee = rupees(min);
  if (max && fee.gt(max)) fee = rupees(max);
  return fee;
}

/** Spec 7.1. Each step rounds to 2 decimals half-up; net is the exact difference. */
export function calculatePayout(i: PayoutInput): PayoutBreakdown {
  const hundred = new Decimal(100);
  const gross = rupees(D(i.usdt).mul(D(i.rate)));
  const taxHeld = rupees(gross.mul(D(i.taxPercent)).div(hundred));
  const fee = feeFor(gross, i);
  const gstOnFee = i.gstEnabled ? rupees(fee.mul(D(i.gstPercent)).div(hundred)) : new Decimal(0);
  const net = gross.minus(taxHeld).minus(fee).minus(gstOnFee);
  return { gross, taxHeld, fee, gstOnFee, net };
}

/**
 * Convert a rupee amount the user wants to receive into a USDT base amount
 * (2 decimals, rounded down). The final quote is always recomputed from USDT.
 */
export function usdtForNetRupees(net: DecimalLike, i: Omit<PayoutInput, "usdt">): Decimal {
  const pct = (v: DecimalLike) => D(v).div(100);
  const gstShare = i.gstEnabled ? pct(i.gstPercent).plus(1) : new Decimal(1);
  const keep = new Decimal(1).minus(pct(i.taxPercent));
  const factor = keep.minus(pct(i.feePercent).mul(gstShare));
  if (factor.lte(0)) throw new Error("Fee and tax settings leave nothing to pay out");
  // First as if the fee were a plain percentage; if that fee falls outside the
  // minimum or maximum, the fee is that flat amount instead: gross = (net + fee + GST) / (1 - tax%).
  const gross = D(net).div(factor);
  const pctFee = gross.mul(pct(i.feePercent));
  const min = feeLimit(i.feeMin);
  const max = feeLimit(i.feeMax);
  const flat = min && pctFee.lt(min) ? min : max && pctFee.gt(max) ? max : null;
  const target = flat ? D(net).plus(flat.mul(gstShare)).div(keep) : gross;
  return target.div(D(i.rate)).toDecimalPlaces(2, Decimal.ROUND_DOWN);
}

/** " (at least ₹10, at most ₹500)" for help text; empty when no limits are set. */
export function feeRange(min: string, max: string): string {
  const parts = [feeLimit(min) && `at least ${fmtInr(min)}`, feeLimit(max) && `at most ${fmtInr(max)}`].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** "Platform fee (1%)", or just "Platform fee" when a minimum or maximum decided the amount. */
export function feeLabel(prefix: string, o: { gross: DecimalLike; fee: DecimalLike; feePercent: DecimalLike }): string {
  const plain = rupees(D(o.gross).mul(D(o.feePercent)).div(100));
  return plain.eq(D(o.fee)) ? `${prefix} (${D(o.feePercent).toString()}%)` : prefix;
}

/** On-chain whole units -> USDT, using that network's decimals. */
export function fromUnits(units: bigint | string, decimals: number): Decimal {
  return D(units.toString()).div(new Decimal(10).pow(decimals));
}

/** USDT -> on-chain whole units. Throws if the amount has more precision than the token supports. */
export function toUnits(amount: DecimalLike, decimals: number): bigint {
  const scaled = D(amount).mul(new Decimal(10).pow(decimals));
  if (!scaled.isInteger()) throw new Error(`Amount ${amount.toString()} has more than ${decimals} decimals`);
  return BigInt(scaled.toFixed(0));
}

export const fmtUsdt = (v: DecimalLike) => {
  const d = D(v);
  // Show at least 2 decimals, never hide significant ones.
  const s = d.toFixed();
  const [, frac = ""] = s.split(".");
  return frac.length <= 2 ? d.toFixed(2) : s;
};

export const fmtInr = (v: DecimalLike) => {
  const d = D(v).toFixed(2);
  const [int, frac] = d.split(".");
  const neg = int.startsWith("-");
  const digits = neg ? int.slice(1) : int;
  // Indian grouping: 12,34,567.89
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return `${neg ? "-" : ""}₹${grouped}.${frac}`;
};
