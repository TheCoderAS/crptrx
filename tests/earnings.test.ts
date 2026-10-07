import { beforeEach, describe, expect, it } from "vitest";
import type { Admin } from "@prisma/client";
import { prisma } from "@/server/db";
import { D, Decimal } from "@/server/money";
import { createQuote } from "@/server/orders/quote";
import { markPaid } from "@/server/orders/actions";
import { transition } from "@/server/orders/stateMachine";
import { setReward, settleAdmin, splitFor, voidEarning } from "@/server/earnings";
import { writeSetting } from "@/server/settings";
import { baseSettings, makeUser, resetDb } from "./helpers";

const SYS = { type: "SYSTEM" as const, id: null };
const BOSS = { type: "ADMIN" as const, id: "boss" };

describe("who earns what (fixed at quote)", () => {
  const admin = { id: "a1", profitPercent: "50", status: "ACTIVE", role: "ADMIN" };

  it("house customer, no bonus: nothing for any admin", () => {
    expect(splitFor({ margin: new Decimal(200), customer: { adminId: null, rewardPercent: 0 }, admin: null })).toEqual({ adminId: null, adminSharePercent: null, adminShare: null, rewardPercent: null, reward: "0.00" });
  });

  it("admin's customer: the admin gets their share of the margin", () => {
    const s = splitFor({ margin: new Decimal(200), customer: { adminId: "a1", rewardPercent: 0 }, admin });
    expect(s).toMatchObject({ adminId: "a1", adminSharePercent: "50", adminShare: "100.00", reward: "0.00" });
  });

  it("the bonus reward is a % of the admin's share; the admin keeps the rest", () => {
    expect(splitFor({ margin: new Decimal(200), customer: { adminId: "a1", rewardPercent: "5" }, admin }).reward).toBe("5.00"); // 5% of ₹100
    expect(splitFor({ margin: new Decimal(200), customer: { adminId: "a1", rewardPercent: "100" }, admin }).reward).toBe("100.00"); // the whole share
  });

  it("house customer's bonus reward is a % of the house's share (the whole margin)", () => {
    expect(splitFor({ margin: new Decimal(200), customer: { adminId: null, rewardPercent: "10" }, admin: null }).reward).toBe("20.00");
  });

  it("the case from staging: 1 USDT, margin ₹3.49, 30% share, 5% bonus -> ₹0.05 bonus, admin keeps ₹1.00", () => {
    const s = splitFor({ margin: new Decimal("3.49"), customer: { adminId: "a1", rewardPercent: "5" }, admin: { ...admin, profitPercent: "30" } });
    expect(s.adminShare).toBe("1.05");
    expect(s.reward).toBe("0.05");
  });

  it("no margin (negative, or no market price): no share and no bonus", () => {
    expect(splitFor({ margin: new Decimal(-30), customer: { adminId: "a1", rewardPercent: "50" }, admin })).toMatchObject({ adminShare: "0.00", reward: "0.00" });
    expect(splitFor({ margin: null, customer: { adminId: null, rewardPercent: "50" }, admin: null }).reward).toBe("0.00");
  });

  it("a disabled admin earns nothing; the order is the house's", () => {
    expect(splitFor({ margin: new Decimal(200), customer: { adminId: "a1", rewardPercent: 0 }, admin: { ...admin, status: "DISABLED" } }).adminId).toBeNull();
  });
});

describe("earnings ledger", () => {
  let ravi: Admin;
  let sita: Admin;

  beforeEach(async () => {
    await resetDb();
    await baseSettings(); // rate 90, fee 1% + 18% GST, tax 1%
    await writeSetting("rate_market_manual", "92", SYS); // margin ₹2 per USDT
    ravi = await prisma.admin.create({ data: { name: "Ravi", email: "ravi@admin.dev", passwordHash: "x", totpEnabled: true, inviteCode: "RAVI0001", profitPercent: "50" } });
    sita = await prisma.admin.create({ data: { name: "Sita", email: "sita@admin.dev", passwordHash: "x", totpEnabled: true, inviteCode: "SITA0001", profitPercent: "50" } });
  });

  async function customerOf(admin: Admin | null, rewardPercent = "0") {
    const u = await makeUser();
    await prisma.user.update({ where: { id: u.user.id }, data: { adminId: admin?.id ?? null, rewardPercent } });
    return u;
  }
  async function quoteAndPay(u: Awaited<ReturnType<typeof customerOf>>, usdt = "100") {
    const o = await createQuote({ userId: u.user.id, network: "TRON", amountType: "USDT", amount: usdt, payoutMethodId: u.pm.id }, u.actor);
    await prisma.$transaction(async (tx) => {
      for (const s of ["PAYMENT_CONFIRMED", "UNDER_REVIEW", "APPROVED"] as const) await transition(tx, o.id, s, SYS);
    });
    await markPaid(o.id, { amount: D(o.net).toFixed(2), paidAt: new Date(Date.now() - 60_000).toISOString() }, BOSS);
    return o;
  }

  it("the bonus is on the quote and in the payout; the admin's earning is booked when paid", async () => {
    const u = await customerOf(ravi, "45");
    const o = await quoteAndPay(u);
    // 100 USDT x 90 = 9000 gross; margin 200; Ravi's share 100; bonus reward 45% of the share = 45.
    expect(o.margin?.toFixed(2)).toBe("200.00");
    expect(o.adminId).toBe(ravi.id);
    expect(o.adminShare?.toFixed(2)).toBe("100.00");
    expect(o.reward.toFixed(2)).toBe("45.00");
    expect(D(o.net).eq(D(o.gross).minus(o.taxHeld).minus(o.fee).minus(o.gstOnFee).plus(45))).toBe(true);
    const e = await prisma.adminEarning.findUniqueOrThrow({ where: { orderId: o.id } });
    expect(e).toMatchObject({ adminId: ravi.id, status: "PENDING" });
    expect(e.amount.toFixed(2)).toBe("55.00");
    expect(e.share.toFixed(2)).toBe("100.00");
    expect(e.reward.toFixed(2)).toBe("45.00");
  });

  it("house customers book no admin earning", async () => {
    const o = await quoteAndPay(await customerOf(null));
    expect(o.adminId).toBeNull();
    expect(await prisma.adminEarning.count()).toBe(0);
  });

  it("moving a customer later doesn't move earnings already paid", async () => {
    const u = await customerOf(ravi);
    await quoteAndPay(u);
    await prisma.user.update({ where: { id: u.user.id }, data: { adminId: sita.id } });
    await quoteAndPay(u);
    const by = await prisma.adminEarning.groupBy({ by: ["adminId"], _count: { _all: true } });
    expect(Object.fromEntries(by.map((b) => [b.adminId, b._count._all]))).toEqual({ [ravi.id]: 1, [sita.id]: 1 });
  });

  it("settling pays out everything pending once, and checks the amount on screen", async () => {
    const u = await customerOf(ravi);
    await quoteAndPay(u);
    await quoteAndPay(u, "50");
    await expect(settleAdmin(ravi.id, { expectedAmount: "1.00" }, BOSS)).rejects.toThrow(/changed/);
    const st = await settleAdmin(ravi.id, { reference: "UTR0000000001", expectedAmount: "150.00" }, BOSS); // 100 + 50
    expect(st.count).toBe(2);
    expect(st.amount.toFixed(2)).toBe("150.00");
    expect(await prisma.adminEarning.count({ where: { adminId: ravi.id, status: "SETTLED", settlementId: st.id } })).toBe(2);
    await expect(settleAdmin(ravi.id, {}, BOSS)).rejects.toThrow(/Nothing pending/);
  });

  it("a super admin can cancel a pending earning, with a reason", async () => {
    const o = await quoteAndPay(await customerOf(ravi));
    const e = await prisma.adminEarning.findUniqueOrThrow({ where: { orderId: o.id } });
    await expect(voidEarning(e.id, "", BOSS)).rejects.toThrow(/why/);
    await voidEarning(e.id, "Customer was a fake account", BOSS);
    expect((await prisma.adminEarning.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("VOID");
    await expect(voidEarning(e.id, "again please", BOSS)).rejects.toThrow(/pending/);
  });

  it("an admin sets a bonus only for their own customers, within limits", async () => {
    const u = await customerOf(ravi);
    const raviActor = { type: "ADMIN" as const, id: ravi.id };
    await setReward(ravi, raviActor, u.user.id, "0.25");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } })).rewardPercent.toString()).toBe("0.25");
    await expect(setReward(sita, { type: "ADMIN", id: sita.id }, u.user.id, "1")).rejects.toThrow(/Not found/);
    await expect(setReward(ravi, raviActor, u.user.id, "101")).rejects.toThrow(/at most/);
    await expect(setReward(ravi, raviActor, u.user.id, "-1")).rejects.toThrow(/percentage/);
    // Super admin: any customer, including the house's.
    const house = await customerOf(null);
    await setReward({ id: "boss", role: "SUPER_ADMIN" }, BOSS, house.user.id, "0.1");
    expect(await prisma.auditLog.count({ where: { action: "CUSTOMER_REWARD_CHANGED" } })).toBe(2);
  });
});
