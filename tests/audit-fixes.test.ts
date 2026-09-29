import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { D } from "@/server/money";
import { HOLD, ingestTransfers } from "@/server/matching";
import { createQuote, expireQuotes, pickUniqueAmount, QUOTE_TTL_MS, TXID_GRACE_MS } from "@/server/orders/quote";
import { transition } from "@/server/orders/stateMachine";
import { approveOrder, markPaid, saveWalletCheck, startReview, submitTxid } from "@/server/orders/actions";
import { updateSetting, writeSetting } from "@/server/settings";
import { addWallet } from "@/server/wallets";
import { ADDR, baseSettings, makeOrder, makeUser, orderById, randTron, randTxid, resetDb, transfer } from "./helpers";

const SYS = { type: "SYSTEM" as const, id: null };
const ADMIN = { type: "ADMIN" as const, id: "admin-1" };

beforeEach(async () => {
  await resetDb();
  await baseSettings();
});

describe("payments can't land on the wrong order", () => {
  it("an expired quote keeps its exact amount reserved for 24 hours", async () => {
    const { order } = await makeOrder("TRON", "100");
    await prisma.order.update({ where: { id: order.id }, data: { status: "EXPIRED" } });
    // Every suffix except the expired one is free; the expired one must not be handed out again.
    for (let i = 0; i < 30; i++) {
      const amt = await pickUniqueAmount(prisma, "TRON", ADDR.TRON, D(100));
      expect(amt?.toFixed(2)).not.toBe(D(order.usdtAmount).toFixed(2));
    }
  });

  it("copying someone else's TxID doesn't take their payment", async () => {
    const victim = await makeOrder("TRON", "100");
    const attacker = await makeOrder("TRON", "50");
    const t = transfer("TRON", D(victim.order.usdtAmount).toString());
    await submitTxid(attacker.order.id, attacker.user.id, t.txid, attacker.actor);
    await ingestTransfers([t]);
    expect((await orderById(victim.order.id)).status).toBe("PAYMENT_CONFIRMED");
    const a = await orderById(attacker.order.id);
    expect(a.status).toBe("ON_HOLD");
    expect(a.holdReason).toBe(HOLD.TXID_USED);
    expect(a.txid).toBeNull();
  });

  it("an order whose TxID is never found goes on hold instead of staying open", async () => {
    const { order, user, actor } = await makeOrder("TRON", "100");
    await submitTxid(order.id, user.id, randTxid("TRON"), actor);
    const later = new Date(order.createdAt.getTime() + QUOTE_TTL_MS + TXID_GRACE_MS + 60_000);
    const changed = await expireQuotes(later);
    expect(changed).toContain(order.id);
    const o = await orderById(order.id);
    expect(o.status).toBe("ON_HOLD");
    expect(o.holdReason).toBe(HOLD.TXID_NOT_FOUND);
  });

  it("late payments are still checked against limits", async () => {
    await writeSetting("limit_user_daily_usdt", "150", SYS);
    const u = await makeUser();
    const q = () => createQuote({ userId: u.user.id, network: "TRON", amountType: "USDT", amount: "100", payoutMethodId: u.pm.id }, u.actor);
    const first = await q();
    await prisma.order.update({ where: { id: first.id }, data: { status: "EXPIRED", quoteExpiresAt: new Date(Date.now() - 60_000) } });
    const second = await q(); // allowed: expired orders don't count
    await ingestTransfers([transfer("TRON", D(first.usdtAmount).toString())]);
    const events = await prisma.orderEvent.findMany({ where: { orderId: first.id, toStatus: "ON_HOLD" } });
    expect(events[0].privateNote).toMatch(/over limit/i);
    void second;
  });
});

describe("paying out", () => {
  async function underReview(receivedAmount?: string) {
    const { order } = await makeOrder("TRON", "100");
    await prisma.$transaction((tx) => transition(tx, order.id, "PAYMENT_CONFIRMED", SYS));
    await prisma.order.update({ where: { id: order.id }, data: { txid: randTxid("TRON"), receivedAmount: receivedAmount ?? order.usdtAmount } });
    await startReview(order.id, ADMIN);
    await saveWalletCheck(order.id, { result: "CLEAN", note: "No flags" }, ADMIN);
    return order;
  }

  it("won't approve a short payment without a written reason", async () => {
    const order = await underReview("50");
    await expect(approveOrder(order.id, ADMIN)).rejects.toThrow(/received 50/);
    await expect(approveOrder(order.id, ADMIN, "ok")).rejects.toThrow(/override/);
    await approveOrder(order.id, ADMIN, "Customer sent the rest in a second transfer, checked");
    expect((await orderById(order.id)).status).toBe("APPROVED");
  });

  it("one UTR can't settle two orders", async () => {
    const a = await underReview();
    const b = await underReview();
    await approveOrder(a.id, ADMIN);
    await approveOrder(b.id, ADMIN);
    const now = new Date().toISOString();
    await markPaid(a.id, { utr: "HDFCR52026092899", amount: D(a.net).toFixed(2), paidAt: now }, ADMIN);
    await expect(markPaid(b.id, { utr: "HDFCR52026092899", amount: D(b.net).toFixed(2), paidAt: now }, ADMIN)).rejects.toThrow(/already recorded/);
  });
});

describe("settings and wallets", () => {
  it("refuses more decimals than the database keeps, with a readable name", async () => {
    await expect(updateSetting("rate", "88.12345", ADMIN)).rejects.toThrow(/Rate: use at most 4 decimal places/);
    await expect(updateSetting("limit_min_order_usdt", "10.001", ADMIN)).rejects.toThrow(/Minimum per order/);
  });

  it("with wallets required, a wallet on the order's network is needed", async () => {
    const u = await makeUser();
    await writeSetting("wallet_registration", "REQUIRED", SYS);
    await addWallet(u.user.id, { network: "TRON", address: randTron() }, u.actor);
    await expect(createQuote({ userId: u.user.id, network: "BSC", amountType: "USDT", amount: "100", payoutMethodId: u.pm.id }, u.actor)).rejects.toThrow(/BNB Smart Chain \(BEP-20\) wallet/);
    await expect(createQuote({ userId: u.user.id, network: "TRON", amountType: "USDT", amount: "100", payoutMethodId: u.pm.id }, u.actor)).resolves.toBeTruthy();
  });
});
