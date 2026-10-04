import { describe, expect, it } from "vitest";
import { calculatePayout, D, feeLabel, fmtInr, fromUnits, toUnits, usdtForNetRupees } from "@/server/money";
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

describe("fee minimum and maximum", () => {
  const cfg = { rate: "90", taxPercent: "1", feePercent: "1", gstEnabled: true, gstPercent: "18" };

  it("empty limits change nothing", () => {
    const a = calculatePayout({ usdt: "100", ...cfg });
    const b = calculatePayout({ usdt: "100", ...cfg, feeMin: "", feeMax: "" });
    expect(b.fee.toFixed(2)).toBe(a.fee.toFixed(2));
    expect(b.net.toFixed(2)).toBe(a.net.toFixed(2));
  });

  it("raises a small fee to the minimum and caps a big one at the maximum", () => {
    const small = calculatePayout({ usdt: "10", ...cfg, feeMin: "25", feeMax: "500" }); // 1% of ₹900 = ₹9
    expect(small.fee.toFixed(2)).toBe("25.00");
    expect(small.gstOnFee.toFixed(2)).toBe("4.50");
    const big = calculatePayout({ usdt: "1000", ...cfg, feeMin: "25", feeMax: "500" }); // 1% of ₹90,000 = ₹900
    expect(big.fee.toFixed(2)).toBe("500.00");
    const mid = calculatePayout({ usdt: "100", ...cfg, feeMin: "25", feeMax: "500" }); // ₹90, in between
    expect(mid.fee.toFixed(2)).toBe("90.00");
  });

  it("only a minimum, or only a maximum, works on its own", () => {
    expect(calculatePayout({ usdt: "10", ...cfg, feeMin: "25" }).fee.toFixed(2)).toBe("25.00");
    expect(calculatePayout({ usdt: "1000", ...cfg, feeMax: "100" }).fee.toFixed(2)).toBe("100.00");
  });

  it("a minimum bigger than the amount leaves nothing to pay", () => {
    expect(calculatePayout({ usdt: "0.1", ...cfg, feeMin: "25" }).net.lte(0)).toBe(true);
  });

  it("converts a rupee target back correctly when the minimum or maximum applies", () => {
    for (const [net, limits] of [["800", { feeMin: "25" }], ["200000", { feeMax: "100" }], ["9000", { feeMin: "25", feeMax: "500" }]] as const) {
      const all = { ...cfg, ...limits };
      const u = usdtForNetRupees(net, all);
      const p = calculatePayout({ usdt: u, ...all });
      expect(p.net.lte(D(net))).toBe(true);
      // Within one cent of USDT of the target (₹0.90 at 90, plus rounding).
      expect(p.net.gt(D(net).minus(2))).toBe(true);
    }
  });

  it("labels the fee with its % only when the % decided it", () => {
    expect(feeLabel("Platform fee", { gross: "9000", fee: "90", feePercent: "1" })).toBe("Platform fee (1%)");
    expect(feeLabel("Platform fee", { gross: "900", fee: "25", feePercent: "1" })).toBe("Platform fee");
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

describe("fee limit settings", () => {
  it("refuses a minimum above the maximum, allows empty", async () => {
    const { checkFeeLimits } = await import("@/server/settings");
    expect(() => checkFeeLimits("600", "500")).toThrow(/minimum fee/);
    expect(() => checkFeeLimits("25", "")).not.toThrow();
    expect(() => checkFeeLimits("", "")).not.toThrow();
    expect(() => checkFeeLimits("25", "25")).not.toThrow();
  });
});
