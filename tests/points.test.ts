import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { encrypt } from "@/server/crypto";
import { D } from "@/server/money";
import { createQuote, expireQuotes } from "@/server/orders/quote";
import { markPaid } from "@/server/orders/actions";
import { transition } from "@/server/orders/stateMachine";
import { cancelPoints, pointsBalance, pointsForSale } from "@/server/points";
import { ensureReferralCode, resolveInvite, saveReferral } from "@/server/referral";
import { updateSetting, writeSetting } from "@/server/settings";
import { baseSettings, makeUser, resetDb } from "./helpers";

const SYS = { type: "SYSTEM" as const, id: null };
const BOSS = { type: "ADMIN" as const, id: "boss" };
const DAY = 24 * 3600_000;

let k = 0;
/** A user with their own phone and bank account (the shared helper gives everyone the same). */
async function person(referredById: string | null = null) {
  k++;
  const u = await makeUser();
  await prisma.user.update({ where: { id: u.user.id }, data: { mobile: `+9198${String(k).padStart(8, "0")}`, referredById } });
  await prisma.payoutMethod.update({ where: { id: u.pm.id }, data: { accountNumberEncrypted: encrypt(`5000${String(k).padStart(8, "0")}`) } });
  return u;
}

async function sell(u: Awaited<ReturnType<typeof person>>, usdt = "100", usePoints = false) {
  return createQuote({ userId: u.user.id, network: "TRON", amountType: "USDT", amount: usdt, payoutMethodId: u.pm.id, usePoints }, u.actor);
}
async function pay(orderId: string, from: "QUOTE_READY" | "EXPIRED" = "QUOTE_READY") {
  await prisma.$transaction(async (tx) => {
    for (const s of ["PAYMENT_CONFIRMED", "UNDER_REVIEW", "APPROVED"] as const) await transition(tx, orderId, s, SYS, s === "PAYMENT_CONFIRMED" ? { from } : {});
  });
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  await markPaid(orderId, { amount: D(o.net).toFixed(2), paidAt: new Date(Date.now() - 60_000).toISOString() }, BOSS);
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

beforeEach(async () => {
  await resetDb();
  await baseSettings({ referral_enabled: true, referral_mode: "EVERY", referral_points_per_usdt: "1", referral_max_points_per_sale: 500, referral_min_sale_usdt: "10", referral_hold_days: 0, referral_expiry_days: 365 });
});

describe("how many points a friend's sale earns", () => {
  const s = { referral_points_per_usdt: "0.5", referral_max_points_per_sale: 100, referral_min_sale_usdt: "20" };
  it("per USDT, rounded down, capped, nothing below the smallest sale", () => {
    expect(pointsForSale("19.99", s)).toBe(0);
    expect(pointsForSale("21", s)).toBe(10);
    expect(pointsForSale("1000", s)).toBe(100);
    expect(pointsForSale("1000", { ...s, referral_max_points_per_sale: 0 })).toBe(500); // 0 = no cap
  });
});

describe("settings", () => {
  it("refuses values that don't make sense", async () => {
    await expect(updateSetting("referral_mode", "SOMETIMES", BOSS)).rejects.toThrow(/first sale or every sale/);
    await expect(updateSetting("referral_hold_days", "120", BOSS)).rejects.toThrow(/0 to 90/);
    await expect(updateSetting("referral_points_per_usdt", "-1", BOSS)).rejects.toThrow(/number/);
    await expect(updateSetting("referral_max_points_per_sale", "1.5", BOSS)).rejects.toThrow(/whole number/);
    await updateSetting("referral_points_per_usdt", "0.5", BOSS);
    await updateSetting("referral_enabled", "false", BOSS);
  });
});

describe("codes", () => {
  it("each user gets one code; signing up with it links the friend and their admin", async () => {
    const ravi = await prisma.admin.create({ data: { name: "Ravi", email: "ravi@admin.dev", passwordHash: "x", inviteCode: "RAVI0001", profitPercent: "50" } });
    const a = await person();
    await prisma.user.update({ where: { id: a.user.id }, data: { adminId: ravi.id } });
    const code = await ensureReferralCode(a.user.id);
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(await ensureReferralCode(a.user.id)).toBe(code); // made once
    expect(await resolveInvite(code.toLowerCase())).toEqual({ adminId: ravi.id, referredById: a.user.id });
    // A disabled user's code no longer works.
    await prisma.user.update({ where: { id: a.user.id }, data: { status: "DISABLED" } });
    await expect(resolveInvite(code)).rejects.toThrow(/Code not found/);
    // An admin can't take a code a customer already has.
    await expect(saveReferral(ravi.id, { inviteCode: code, profitPercent: "50" })).rejects.toThrow(/customer already uses/);
  });
});

describe("earning points", () => {
  it("only when the friend's sale is paid, every sale in 'every sale' mode", async () => {
    const a = await person();
    const b = await person(a.user.id);
    const o = await sell(b, "120");
    expect((await pointsBalance(a.user.id)).usable).toBe(0); // quoted, not paid
    await pay(o.id);
    await pay((await sell(b, "30")).id);
    expect((await pointsBalance(a.user.id)).usable).toBe(150);
    expect(await prisma.auditLog.count({ where: { action: "USER_POINTS_EARNED" } })).toBe(2);
    // The friend's own payout and the admins are untouched.
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).pointsUsed).toBe(0);
  });

  it("'first sale' mode: once per friend; small sales don't count; off = nothing", async () => {
    await writeSetting("referral_mode", "FIRST", SYS);
    const a = await person();
    const b = await person(a.user.id);
    await pay((await sell(b, "10")).id); // the minimum counts
    await pay((await sell(b, "200")).id);
    expect((await pointsBalance(a.user.id)).usable).toBe(10);
    await writeSetting("referral_enabled", false, SYS);
    const c = await person(a.user.id);
    await pay((await sell(c, "50")).id);
    expect(await prisma.referralPoint.count({ where: { fromUserId: c.user.id } })).toBe(0);
  });

  it("pending first, then usable, then expired", async () => {
    await writeSetting("referral_hold_days", 7, SYS);
    await writeSetting("referral_expiry_days", 30, SYS);
    const a = await person();
    await pay((await sell(await person(a.user.id), "40")).id);
    const now = Date.now();
    expect(await pointsBalance(a.user.id)).toMatchObject({ pending: 40, usable: 0 });
    expect(await pointsBalance(a.user.id, prisma, new Date(now + 8 * DAY))).toMatchObject({ pending: 0, usable: 40 });
    expect(await pointsBalance(a.user.id, prisma, new Date(now + 40 * DAY))).toMatchObject({ usable: 0, expired: 40 });
  });

  it("no points when the friend shares the referrer's mobile, PAN, UPI or bank account", async () => {
    const a = await person();
    const b = await person(a.user.id);
    await prisma.user.update({ where: { id: b.user.id }, data: { mobile: (await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })).mobile } });
    await pay((await sell(b, "50")).id);
    const c = await person(a.user.id);
    await prisma.payoutMethod.create({ data: { userId: a.user.id, type: "UPI", holderName: "A", upiId: "same@upi", status: "APPROVED" } });
    await prisma.payoutMethod.create({ data: { userId: c.user.id, type: "UPI", holderName: "C", upiId: " SAME@upi", status: "PENDING" } });
    await pay((await sell(c, "50")).id);
    const rows = await prisma.referralPoint.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.status, r.reason])).toEqual([["BLOCKED", "Same mobile number as the referrer"], ["BLOCKED", "Same UPI ID as the referrer"]]);
    expect((await pointsBalance(a.user.id)).usable).toBe(0);
  });

  it("a super admin can cancel pending points, with a reason; not usable ones", async () => {
    await writeSetting("referral_hold_days", 7, SYS);
    const a = await person();
    await pay((await sell(await person(a.user.id), "40")).id);
    const p = await prisma.referralPoint.findFirstOrThrow();
    await expect(cancelPoints(p.id, "x", BOSS)).rejects.toThrow(/why/);
    await expect(cancelPoints(p.id, "Fake friend account", BOSS, new Date(Date.now() + 8 * DAY))).rejects.toThrow(/Only pending/);
    await cancelPoints(p.id, "Fake friend account", BOSS);
    expect((await pointsBalance(a.user.id)).pending).toBe(0);
  });
});

describe("using points on your own sale", () => {
  async function withPoints(n: string) {
    const a = await person();
    await pay((await sell(await person(a.user.id), n)).id);
    return a;
  }

  it("adds them to the payout, holds them, spends them when paid", async () => {
    const a = await withPoints("75");
    const plain = await sell(a, "100");
    const o = await sell(a, "100", true);
    expect(o.pointsUsed).toBe(75);
    expect(D(o.net).minus(D(plain.net)).toNumber()).toBe(75);
    expect(await pointsBalance(a.user.id)).toMatchObject({ usable: 0, held: 75 });
    // Nothing left for a second order.
    expect((await sell(a, "100", true)).pointsUsed).toBe(0);
    await pay(o.id);
    expect(await pointsBalance(a.user.id)).toMatchObject({ usable: 0, held: 0, spent: 75 });
  });

  it("an expired quote gives them back; a late payment takes them again", async () => {
    const a = await withPoints("60");
    const o = await sell(a, "100", true);
    await prisma.order.update({ where: { id: o.id }, data: { quoteExpiresAt: new Date(Date.now() - 1000) } });
    await expireQuotes();
    expect(await pointsBalance(a.user.id)).toMatchObject({ usable: 60, held: 0 });
    const paid = await pay(o.id, "EXPIRED");
    expect(paid.pointsUsed).toBe(60);
    expect(await pointsBalance(a.user.id)).toMatchObject({ usable: 0, spent: 60 });
  });

  it("if they were spent elsewhere meanwhile, the late order's payout drops instead (never paid twice)", async () => {
    const a = await withPoints("60");
    const o = await sell(a, "100", true);
    await prisma.order.update({ where: { id: o.id }, data: { quoteExpiresAt: new Date(Date.now() - 1000) } });
    await expireQuotes();
    const other = await sell(a, "100", true); // uses the 60 released points
    await pay(other.id);
    const late = await pay(o.id, "EXPIRED");
    expect(late.pointsUsed).toBe(0);
    expect(D(late.net).toFixed(2)).toBe(D(o.net).minus(60).toFixed(2));
    expect(await pointsBalance(a.user.id)).toMatchObject({ usable: 0, held: 0, spent: 60 });
    expect(await prisma.orderEvent.count({ where: { orderId: o.id, publicMessage: { contains: "taken off this payout" } } })).toBe(1);
  });
});
