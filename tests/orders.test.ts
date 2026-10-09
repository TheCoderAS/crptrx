import { beforeEach, describe, expect, it } from "vitest";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { D } from "@/server/money";
import { createQuote, expireQuotes } from "@/server/orders/quote";
import { ALLOWED_NEXT, transition } from "@/server/orders/stateMachine";
import { approveOrder, closeManual, markPaid, putOnHold, releaseHold, saveWalletCheck, startReview, submitTxid } from "@/server/orders/actions";
import { writeSetting } from "@/server/settings";
import { ADDR, baseSettings, makeOrder, makeUser, orderById, randTxid, resetDb } from "./helpers";

const ADMIN = { type: "ADMIN" as const, id: "admin-1" };
const SYS = { type: "SYSTEM" as const, id: null };

beforeEach(async () => {
  await resetDb();
  await baseSettings();
});

async function toStatus(id: string, path: OrderStatus[]) {
  for (const s of path) await prisma.$transaction((tx) => transition(tx, id, s, SYS));
}

describe("quotes (spec 4.4, 7.1, 7.2)", () => {
  it("freezes the payout breakdown on the order", async () => {
    const { order } = await makeOrder("TRON", "100");
    const amt = D(order.usdtAmount);
    expect(amt.toFixed(2)).toBe("100.00"); // exactly what the user typed
    expect(D(order.gross).eq(amt.mul(90).toDecimalPlaces(2))).toBe(true);
    expect(order.status).toBe("QUOTE_READY");
    expect(order.depositAddress).toBe(ADDR.TRON);
    expect(order.id).toMatch(/^ORD-\d{4}-\d{6}$/);
    expect(order.quoteExpiresAt.getTime() - order.createdAt.getTime()).toBe(15 * 60_000);
  });

  it("two users asking for the same amount both get exactly that amount", async () => {
    const a = await makeOrder("TRON", "100");
    const b = await makeOrder("TRON", "100");
    expect(D(a.order.usdtAmount).toFixed(2)).toBe("100.00");
    expect(D(b.order.usdtAmount).toFixed(2)).toBe("100.00");
  });

  it("enforces per-order and per-day limits", async () => {
    await expect(makeOrder("TRON", "5")).rejects.toThrow(/minimum/);
    await expect(makeOrder("TRON", "1000.01")).rejects.toThrow(/maximum/);
    const atMax = await makeOrder("TRON", "1000");
    expect(D(atMax.order.usdtAmount).toFixed(2)).toBe("1000.00");
    await writeSetting("limit_user_daily_usdt", "150", SYS);
    const u = await makeUser();
    const q = (amount: string) => createQuote({ userId: u.user.id, network: "TRON", amountType: "USDT", amount, payoutMethodId: u.pm.id }, u.actor);
    await q("100");
    await expect(q("100")).rejects.toThrow(/daily limit/);
  });

  it("expired orders don't count toward limits", async () => {
    await writeSetting("limit_user_daily_usdt", "150", SYS);
    const u = await makeUser();
    const q = (amount: string) => createQuote({ userId: u.user.id, network: "TRON", amountType: "USDT", amount, payoutMethodId: u.pm.id }, u.actor);
    const first = await q("100");
    await toStatus(first.id, ["EXPIRED"]);
    await q("100");
  });

  it("only KYC-approved users with an approved payout method can order", async () => {
    const u = await makeUser({ verified: false });
    await expect(createQuote({ userId: u.user.id, network: "TRON", amountType: "USDT", amount: "100", payoutMethodId: u.pm.id }, u.actor)).rejects.toThrow(/identity/);
  });

  it("blocks quotes when the rate is stale or the network is off", async () => {
    await prisma.setting.update({ where: { key: "rate" }, data: { updatedAt: new Date(Date.now() - 13 * 3600_000) } });
    await expect(makeOrder("TRON")).rejects.toThrow(/rate/);
    await writeSetting("rate", "90", SYS);
    await writeSetting("network_enabled", { TRON: false, BSC: true }, SYS);
    await expect(makeOrder("TRON")).rejects.toThrow(/paused/);
    await makeOrder("BSC");
  });

  it("a rate change after a quote leaves the existing order unchanged", async () => {
    const { order } = await makeOrder("TRON", "100");
    await writeSetting("rate", "95", SYS);
    await writeSetting("fee_percent", "3", SYS);
    const after = await orderById(order.id);
    expect(after.rate.toString()).toBe(order.rate.toString());
    expect(after.net.toString()).toBe(order.net.toString());
    expect(after.fee.toString()).toBe(order.fee.toString());
  });

  it("accepts a rupee amount and converts it", async () => {
    const u = await makeUser();
    const o = await createQuote({ userId: u.user.id, network: "TRON", amountType: "INR", amount: "9000", payoutMethodId: u.pm.id }, u.actor);
    expect(D(o.usdtAmount).gte(100)).toBe(true); // ~101.xx USDT for ₹9000 net at 90
  });
});

describe("fee limits and margin on the order", () => {
  it("records the fee limits and applies them", async () => {
    await writeSetting("fee_min_inr", "25", SYS);
    await writeSetting("fee_max_inr", "500", SYS);
    const { order } = await makeOrder("TRON", "10"); // 1% of ₹900 = ₹9 -> ₹25
    expect(order.fee.toFixed(2)).toBe("25.00");
    expect(order.feeMin?.toFixed(2)).toBe("25.00");
    expect(order.feeMax?.toFixed(2)).toBe("500.00");
  });

  it("no limits and no market price: nothing extra recorded", async () => {
    const { order } = await makeOrder("TRON", "100");
    expect(order.feeMin).toBeNull();
    expect(order.feeMax).toBeNull();
    expect(order.marketRate).toBeNull();
    expect(order.margin).toBeNull();
  });

  it("Manual mode: margin from the typed market price", async () => {
    await writeSetting("rate_market_manual", "92.5", SYS);
    const { order } = await makeOrder("TRON", "100"); // (92.5 - 90) x 100
    expect(order.marketRate?.toString()).toBe("92.5");
    expect(order.margin?.toFixed(2)).toBe("250.00");
  });

  it("Auto mode: margin from the live market price", async () => {
    await writeSetting("rate_mode", "AUTO", SYS);
    await writeSetting("rate_market_manual", "999", SYS); // ignored in Auto
    await prisma.rateFeedState.upsert({ where: { id: 1 }, create: { id: 1, lastOkAt: new Date(), lastMarket: "91.8" }, update: { lastOkAt: new Date(), lastMarket: "91.8" } });
    const { order } = await makeOrder("TRON", "50"); // (91.8 - 90) x 50
    expect(order.marketRate?.toString()).toBe("91.8");
    expect(order.margin?.toFixed(2)).toBe("90.00");
  });
});

describe("expiry job (spec 8.4)", () => {
  it("moves quotes past expiry to EXPIRED and writes the timeline", async () => {
    const { order } = await makeOrder("TRON", "100", new Date(Date.now() - 16 * 60_000));
    const fresh = await makeOrder("TRON", "100");
    const done = await expireQuotes();
    expect(done).toEqual([order.id]);
    expect((await orderById(order.id)).status).toBe("EXPIRED");
    expect((await orderById(fresh.order.id)).status).toBe("QUOTE_READY");
    const ev = await prisma.orderEvent.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    expect(ev.map((e) => e.toStatus)).toEqual(["QUOTE_READY", "EXPIRED"]);
  });
});

describe("status rules (spec 6)", () => {
  it("rejects every move not in the allowed list", async () => {
    const all = Object.keys(ALLOWED_NEXT) as OrderStatus[];
    const paths: Record<OrderStatus, OrderStatus[]> = {
      QUOTE_READY: [],
      EXPIRED: ["EXPIRED"],
      PAYMENT_SUBMITTED: ["PAYMENT_SUBMITTED"],
      PAYMENT_CONFIRMED: ["PAYMENT_CONFIRMED"],
      UNDER_REVIEW: ["PAYMENT_CONFIRMED", "UNDER_REVIEW"],
      ON_HOLD: ["PAYMENT_CONFIRMED", "ON_HOLD"],
      APPROVED: ["PAYMENT_CONFIRMED", "UNDER_REVIEW", "APPROVED"],
      PAID: ["PAYMENT_CONFIRMED", "UNDER_REVIEW", "APPROVED", "PAID"],
      CLOSED_MANUAL: ["PAYMENT_CONFIRMED", "ON_HOLD", "CLOSED_MANUAL"],
    };
    for (const from of all) {
      for (const to of all) {
        if (ALLOWED_NEXT[from].includes(to)) continue;
        const { order } = await makeOrder("TRON", "10");
        await toStatus(order.id, paths[from]);
        await expect(prisma.$transaction((tx) => transition(tx, order.id, to, SYS))).rejects.toThrow(/can't move/);
      }
    }
  }, 120_000);

  it("an admin can't jump PAYMENT_CONFIRMED straight to PAID", async () => {
    const { order } = await makeOrder("TRON");
    await toStatus(order.id, ["PAYMENT_CONFIRMED"]);
    await expect(markPaid(order.id, { utr: "UTR123456789012", amount: D(order.net).toFixed(2), paidAt: new Date().toISOString() }, ADMIN)).rejects.toThrow(/can't move/);
  });
});

describe("admin order workflow (spec 5.4, M7)", () => {
  it("review -> wallet check -> approve -> paid, with user-visible timeline", async () => {
    const { order } = await makeOrder("TRON");
    await toStatus(order.id, ["PAYMENT_CONFIRMED"]);
    await startReview(order.id, ADMIN);
    await saveWalletCheck(order.id, { result: "CLEAN", note: "Checked on tool X: no flags" }, ADMIN);
    // No payment linked yet: approval needs a written reason.
    await expect(approveOrder(order.id, ADMIN)).rejects.toThrow(/No blockchain payment/);
    await prisma.order.update({ where: { id: order.id }, data: { txid: randTxid("TRON"), receivedAmount: order.usdtAmount } });
    await approveOrder(order.id, ADMIN);
    const net = D(order.net).toFixed(2);
    await expect(markPaid(order.id, { utr: "SHORT", amount: net, paidAt: new Date().toISOString() }, ADMIN)).rejects.toThrow(/UTR/);
    await expect(markPaid(order.id, { utr: "HDFCR52026092812", amount: D(order.net).plus("0.01").toFixed(2), paidAt: new Date().toISOString() }, ADMIN)).rejects.toThrow(/exactly/);
    await markPaid(order.id, { utr: "HDFCR52026092812", amount: net, paidAt: new Date().toISOString() }, ADMIN);
    const paid = await orderById(order.id);
    expect(paid.status).toBe("PAID");
    expect(paid.utr).toBe("HDFCR52026092812");
    expect(paid.paidAmount!.toString()).toBe(D(order.net).toString());
    const ev = await prisma.orderEvent.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    expect(ev.map((e) => e.toStatus)).toEqual(["QUOTE_READY", "PAYMENT_CONFIRMED", "UNDER_REVIEW", "APPROVED", "PAID"]);
  });

  it("wallet check is optional: approving without one records the wallet as clean", async () => {
    const { order } = await makeOrder("TRON");
    await toStatus(order.id, ["PAYMENT_CONFIRMED", "UNDER_REVIEW"]);
    await prisma.order.update({ where: { id: order.id }, data: { txid: randTxid("TRON"), receivedAmount: order.usdtAmount } });
    await approveOrder(order.id, ADMIN);
    const o = await orderById(order.id);
    expect(o.status).toBe("APPROVED");
    expect(o.walletCheckResult).toBe("CLEAN");
    expect(o.walletCheckedBy).toBe(ADMIN.id);
    expect(await prisma.auditLog.count({ where: { action: "WALLET_CHECK_DEFAULTED", targetId: order.id } })).toBe(1);
  });

  it("a Suspicious wallet check needs a note; Clean doesn't", async () => {
    const { order } = await makeOrder("TRON");
    await toStatus(order.id, ["PAYMENT_CONFIRMED", "UNDER_REVIEW"]);
    await expect(saveWalletCheck(order.id, { result: "SUSPICIOUS", note: "  " }, ADMIN)).rejects.toThrow(/suspicious/);
    await saveWalletCheck(order.id, { result: "CLEAN", note: "" }, ADMIN);
    expect((await orderById(order.id)).walletCheckNote).toBeNull();
  });

  it("UTR is optional when marking paid", async () => {
    const { order } = await makeOrder("TRON");
    await toStatus(order.id, ["PAYMENT_CONFIRMED", "UNDER_REVIEW"]);
    await prisma.order.update({ where: { id: order.id }, data: { txid: randTxid("TRON"), receivedAmount: order.usdtAmount } });
    await approveOrder(order.id, ADMIN);
    await markPaid(order.id, { utr: "  ", amount: D(order.net).toFixed(2), paidAt: new Date().toISOString() }, ADMIN);
    const o = await orderById(order.id);
    expect(o.status).toBe("PAID");
    expect(o.utr).toBeNull();
    const ev = await prisma.orderEvent.findFirst({ where: { orderId: order.id, toStatus: "PAID" } });
    expect(ev?.publicMessage).toBe("Paid.");
  });

  it("suspicious wallet check blocks approval", async () => {
    const { order } = await makeOrder("TRON");
    await toStatus(order.id, ["PAYMENT_CONFIRMED", "UNDER_REVIEW"]);
    await saveWalletCheck(order.id, { result: "SUSPICIOUS", note: "linked to scam" }, ADMIN);
    await expect(approveOrder(order.id, ADMIN)).rejects.toThrow(/Suspicious/);
  });

  it("hold, release and close-manual work; private notes stay private", async () => {
    const { order } = await makeOrder("BSC");
    await toStatus(order.id, ["PAYMENT_CONFIRMED", "UNDER_REVIEW"]);
    await putOnHold(order.id, { reason: "Sender wallet needs extra checks", message: "We'll email you.", note: "secret note" }, ADMIN);
    expect((await orderById(order.id)).holdReason).toBe("Sender wallet needs extra checks");
    await releaseHold(order.id, undefined, ADMIN);
    await putOnHold(order.id, { reason: "Other" }, ADMIN);
    await expect(closeManual(order.id, { resolutionNote: "" }, ADMIN)).rejects.toThrow();
    await closeManual(order.id, { resolutionNote: "Refunded", returnTxid: randTxid("BSC") }, ADMIN);
    const ev = await prisma.orderEvent.findMany({ where: { orderId: order.id } });
    const hold = ev.find((e) => e.privateNote === "secret note")!;
    expect(hold.publicMessage).not.toContain("secret");
    expect((await orderById(order.id)).status).toBe("CLOSED_MANUAL");
  });
});

describe("TxID submission", () => {
  it("the same TxID on a second order is rejected", async () => {
    const a = await makeOrder("TRON");
    const b = await makeOrder("TRON");
    const txid = randTxid("TRON");
    await submitTxid(a.order.id, a.user.id, txid, a.actor);
    await expect(submitTxid(b.order.id, b.user.id, txid.toUpperCase(), b.actor)).rejects.toThrow(/already submitted/);
  });
  it("a user can't submit on someone else's order", async () => {
    const a = await makeOrder("TRON");
    const b = await makeUser();
    await expect(submitTxid(a.order.id, b.user.id, randTxid("TRON"), b.actor)).rejects.toThrow(/not found/);
  });
});
