import { describe, expect, it } from "vitest";
import { calculatePayout, D, fmtInr, fromUnits, toUnits, usdtForNetRupees } from "@/server/money";
import { NETWORK_INFO } from "@/lib/networks";

describe("payout formula (spec 7.1)", () => {
  it("computes gross, tax, fee, GST and net with half-up rounding", () => {
    // 100.03 USDT at ₹88.47, 1% tax, 1% fee, 18% GST on fee
    const p = calculatePayout({ usdt: "100.03", rate: "88.47", taxPercent: "1", feePercent: "1", gstEnabled: true, gstPercent: "18" });
    expect(p.gross.toFixed(2)).toBe("8849.65"); // 8849.6541 -> 8849.65
    expect(p.taxHeld.toFixed(2)).toBe("88.50"); // 88.4965 -> 88.50 (half-up)
    expect(p.fee.toFixed(2)).toBe("88.50");
    expect(p.gstOnFee.toFixed(2)).toBe("15.93"); // 15.93
    expect(p.net.toFixed(2)).toBe("8656.72");
    expect(p.net.eq(p.gross.minus(p.taxHeld).minus(p.fee).minus(p.gstOnFee))).toBe(true);
  });

  it("GST off gives zero GST", () => {
    const p = calculatePayout({ usdt: "10.01", rate: "90", taxPercent: "1", feePercent: "0.5", gstEnabled: false, gstPercent: "18" });
    expect(p.gross.toFixed(2)).toBe("900.90");
    expect(p.taxHeld.toFixed(2)).toBe("9.01"); // 9.009
    expect(p.fee.toFixed(2)).toBe("4.50"); // 4.5045
    expect(p.gstOnFee.toFixed(2)).toBe("0.00");
    expect(p.net.toFixed(2)).toBe("887.39");
  });

  it("rounds exact halves up", () => {
    const p = calculatePayout({ usdt: "0.5", rate: "0.01", taxPercent: "0", feePercent: "0", gstEnabled: false, gstPercent: "0" });
    expect(p.gross.toFixed(2)).toBe("0.01"); // 0.005 -> 0.01
  });

  it("never uses floating point: 0.1 + 0.2 style amounts stay exact", () => {
    const p = calculatePayout({ usdt: "0.1", rate: "0.2", taxPercent: "0", feePercent: "0", gstEnabled: false, gstPercent: "0" });
    expect(p.gross.toString()).toBe("0.02");
  });

  it("converts a rupee target back to a USDT amount that pays at most that much", () => {
    const cfg = { rate: "88.47", taxPercent: "1", feePercent: "1", gstEnabled: true, gstPercent: "18" };
    const u = usdtForNetRupees("10000", cfg);
    const p = calculatePayout({ usdt: u, ...cfg });
    expect(p.net.lte(D("10000"))).toBe(true);
    expect(p.net.gt(D("9990"))).toBe(true);
  });
});

describe("on-chain unit conversion (spec 8.1)", () => {
  it("100.03 USDT = 100030000 on Tron (6 decimals)", () => {
    expect(toUnits("100.03", NETWORK_INFO.TRON.decimals)).toBe(100030000n);
    expect(fromUnits(100030000n, NETWORK_INFO.TRON.decimals).toString()).toBe("100.03");
  });
  it("100.03 USDT = 100030000000000000000 on BNB Smart Chain (18 decimals)", () => {
    expect(toUnits("100.03", NETWORK_INFO.BSC.decimals)).toBe(100030000000000000000n);
    expect(fromUnits(100030000000000000000n, NETWORK_INFO.BSC.decimals).toString()).toBe("100.03");
  });
  it("a wrong decimal setting gives a wrong amount", () => {
    expect(fromUnits(100030000000000000000n, 6).eq(D("100.03"))).toBe(false);
    expect(fromUnits(100030000n, 18).eq(D("100.03"))).toBe(false);
  });
  it("network decimals are fixed at 6 (Tron) and 18 (BSC)", () => {
    expect(NETWORK_INFO.TRON.decimals).toBe(6);
    expect(NETWORK_INFO.BSC.decimals).toBe(18);
  });
  it("rejects amounts with more precision than the token", () => {
    expect(() => toUnits("1.0000001", 6)).toThrow();
  });
});

describe("rupee display", () => {
  it("uses Indian grouping", () => {
    expect(fmtInr("1234567.8")).toBe("₹12,34,567.80");
    expect(fmtInr("999")).toBe("₹999.00");
  });
});
