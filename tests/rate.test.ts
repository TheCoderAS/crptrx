import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { D, Decimal } from "@/server/money";
import { acceptCurrentMarket, aggregate, evaluate, rateFromMarket, refreshAutoRate, type Fetcher } from "@/server/rateFeed";
import { createQuote } from "@/server/orders/quote";
import { getSettings, rateIsStale, SETTING_DEFAULTS, updateSetting, writeSetting } from "@/server/settings";
import { baseSettings, makeOrder, makeUser, resetDb } from "./helpers";

const SYS = { type: "SYSTEM" as const, id: null };
const ADMIN = { type: "ADMIN" as const, id: "super-1" };
const prices = (p: Record<string, string | Error>): Fetcher => async (src) => {
  const v = p[src];
  if (v === undefined || v instanceof Error) throw v ?? new Error("down");
  return new Decimal(v);
};

beforeEach(async () => {
  await resetDb();
  await baseSettings();
});

describe("price aggregation (pure)", () => {
  it("uses the median and drops an outlier", () => {
    const a = aggregate([{ source: "a", price: "90" }, { source: "b", price: "90.4" }, { source: "c", price: "99" }], 2);
    expect(a.ok && a.market.toFixed(2)).toBe("90.20");
    expect(a.ok && a.dropped).toEqual(["c"]);
  });
  it("fails when too few sources answer", () => {
    const a = aggregate([{ source: "a", price: "90" }, { source: "b", error: "down" }], 2);
    expect(a.ok).toBe(false);
  });
  it("fails when sources disagree", () => {
    expect(aggregate([{ source: "a", price: "80" }, { source: "b", price: "90" }], 2).ok).toBe(false);
  });
  it("applies the margin and rounds down to paise", () => {
    expect(rateFromMarket(D("90"), "2").toFixed(2)).toBe("88.20");
    expect(rateFromMarket(D("90.1234"), "1.5").toFixed(2)).toBe("88.77"); // 88.7715 -> 88.77
  });
  it("refuses a rate outside floor/ceiling and a big jump", () => {
    const s = { ...SETTING_DEFAULTS, rate_floor: "85", rate_ceiling: "95", rate_margin_percent: "2", rate_max_jump_percent: "3", rate_min_sources: 1 };
    expect(evaluate([{ source: "a", price: "100" }], s, null).ok).toBe(false); // 98 > 95
    expect(evaluate([{ source: "a", price: "80" }], s, null).ok).toBe(false); // 78.4 < 85
    const jump = evaluate([{ source: "a", price: "94" }], s, D("90")); // +4.4%
    expect(jump.ok).toBe(false);
    expect(!jump.ok && jump.needsAcceptance).toBe(true);
    expect(evaluate([{ source: "a", price: "92" }], s, D("90")).ok).toBe(true); // +2.2%
  });
});

describe("auto rate in the app", () => {
  beforeEach(async () => {
    await updateSetting("rate_mode", "AUTO", ADMIN);
  });

  it("sets the rate from the market minus margin, and quotes use it", async () => {
    const r = await refreshAutoRate({ fetcher: prices({ coindcx: "90", wazirx: "90.2", coingecko: "89.9" }) });
    expect(r).toMatchObject({ ok: true });
    const s = await getSettings();
    expect(s.rate).toBe("88.20"); // median 90 x 0.98
    expect(rateIsStale(s)).toBe(false);
    const { order } = await makeOrder("TRON", "100");
    expect(order.rate.toString()).toBe("88.2");
  });

  it("logs a rate change only when the value changes", async () => {
    const f = prices({ coindcx: "90", wazirx: "90", coingecko: "90" });
    await refreshAutoRate({ fetcher: f });
    const changes = () => prisma.auditLog.count({ where: { action: "SETTING_CHANGED", targetId: "rate" } });
    const n = await changes();
    await refreshAutoRate({ fetcher: f });
    expect(await changes()).toBe(n);
  });

  it("a failing feed keeps the last rate but blocks quotes once it is too old, and alerts once", async () => {
    await prisma.admin.create({ data: { name: "Owner", email: "owner@test.dev", passwordHash: "x", role: "SUPER_ADMIN" } });
    const t0 = new Date(Date.now() - 40 * 60_000);
    await refreshAutoRate({ now: t0, fetcher: prices({ coindcx: "90", wazirx: "90", coingecko: "90" }) });
    const down = prices({});
    await refreshAutoRate({ now: new Date(Date.now() - 20 * 60_000), fetcher: down });
    await refreshAutoRate({ fetcher: down });
    await refreshAutoRate({ fetcher: down });
    const s = await getSettings();
    expect(s.rate).toBe("88.20");
    expect(rateIsStale(s)).toBe(true); // last good 40 min ago > 30 min limit
    const u = await makeUser();
    await expect(createQuote({ userId: u.user.id, network: "TRON", amountType: "USDT", amount: "100", payoutMethodId: u.pm.id }, u.actor)).rejects.toThrow(/rate/);
    expect(await prisma.outboundMessage.count({ where: { to: "owner@test.dev", subject: "Live rate paused" } })).toBe(1);
  });

  it("a big market jump is refused until an admin accepts it", async () => {
    await refreshAutoRate({ fetcher: prices({ coindcx: "90", wazirx: "90", coingecko: "90" }) });
    const spike = prices({ coindcx: "95", wazirx: "95", coingecko: "95" });
    const r = await refreshAutoRate({ fetcher: spike });
    expect(r).toMatchObject({ ok: false });
    expect((await getSettings()).rate).toBe("88.20");
    // The admin checks the market and accepts: 95 x 0.98 = 93.10, and it's audited.
    await acceptCurrentMarket({ type: "ADMIN", id: "super-1" }, null, spike);
    expect((await getSettings()).rate).toBe("93.10");
    expect(await prisma.auditLog.count({ where: { action: "RATE_JUMP_ACCEPTED" } })).toBe(1);
  });

  it("a typed rate is refused in Auto mode; Manual mode is unaffected by the feed", async () => {
    await refreshAutoRate({ fetcher: prices({ coindcx: "90", wazirx: "90", coingecko: "90" }) });
    await expect(updateSetting("rate", "91", ADMIN)).rejects.toThrow(/Auto mode/);
    await updateSetting("rate_mode", "MANUAL", ADMIN);
    await updateSetting("rate", "91", ADMIN);
    expect(await refreshAutoRate({ fetcher: prices({ coindcx: "70" }) })).toEqual({ skipped: true });
    expect((await getSettings()).rate).toBe("91");
  });

  it("validates floor < ceiling and known sources", async () => {
    await expect(updateSetting("rate_floor", "130", ADMIN)).rejects.toThrow(/below the ceiling/);
    await expect(updateSetting("rate_sources", "coindcx\nmadeup", ADMIN)).rejects.toThrow(/Unknown price source/);
    await writeSetting("rate_min_sources", 1, SYS);
  });
});
