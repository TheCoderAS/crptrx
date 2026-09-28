import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NetworkCode } from "@/lib/networks";
import { prisma } from "@/server/db";
import { D } from "@/server/money";
import { HOLD, ingestTransfers, verifySubmittedTxid } from "@/server/matching";
import { setAdapterForTests, getAdapter, type NetworkAdapter, type TxLookup } from "@/server/networks";
import { bscAdapter } from "@/server/networks/bsc";
import { tronAdapter } from "@/server/networks/tron";
import { submitTxid } from "@/server/orders/actions";
import { expireQuotes } from "@/server/orders/quote";
import { ADDR, baseSettings, makeOrder, orderById, randBsc, randTron, resetDb, transfer } from "./helpers";
import type { ChainTransfer } from "@/server/networks/types";

beforeEach(async () => {
  await resetDb();
  await baseSettings();
});
afterEach(() => {
  setAdapterForTests("TRON", tronAdapter);
  setAdapterForTests("BSC", bscAdapter);
});

/** Replace a network's chain reads with a fixed set of transactions. */
function fakeChain(network: NetworkCode, txs: Record<string, Partial<TxLookup> & { transfers: ChainTransfer[] }>) {
  const real = getAdapter(network);
  const fake: NetworkAdapter = {
    ...real,
    async lookupTx(txid) {
      const t = txs[real.normalizeTxid(txid)];
      return t ? { found: true, success: true, final: true, ...t } : { found: false, success: false, final: false, transfers: [] };
    },
  };
  setAdapterForTests(network, fake);
}

const statusOf = async (id: string) => (await orderById(id)).status;

describe("matching by amount (spec 7.3)", () => {
  it("matches an exact-amount payment on the same network", async () => {
    const { order } = await makeOrder("TRON", "100");
    const ev = await ingestTransfers([transfer("TRON", order.usdtAmount.toString())]);
    expect(ev).toEqual([{ orderId: order.id, kind: "CONFIRMED" }]);
    const o = await orderById(order.id);
    expect(o.status).toBe("PAYMENT_CONFIRMED");
    expect(o.txid).toBeTruthy();
    expect(o.senderAddress).toBeTruthy();
  });

  it("same amount open on Tron and BSC: each payment matches only its own network", async () => {
    const tron = await makeOrder("TRON", "100");
    const bsc = await makeOrder("BSC", "100");
    // Force identical amounts on both networks.
    await prisma.order.update({ where: { id: bsc.order.id }, data: { usdtAmount: tron.order.usdtAmount } });
    const amt = tron.order.usdtAmount.toString();
    await ingestTransfers([transfer("BSC", amt)]);
    expect(await statusOf(bsc.order.id)).toBe("PAYMENT_CONFIRMED");
    expect(await statusOf(tron.order.id)).toBe("QUOTE_READY");
    await ingestTransfers([transfer("TRON", amt)]);
    expect(await statusOf(tron.order.id)).toBe("PAYMENT_CONFIRMED");
  });

  it("a payment with no matching order goes to the unmatched list", async () => {
    await makeOrder("TRON", "100");
    await ingestTransfers([transfer("TRON", "77.77")]);
    expect(await prisma.incomingTransfer.count({ where: { status: "UNMATCHED" } })).toBe(1);
  });

  it("a payment made before the quote was created is not matched", async () => {
    const { order } = await makeOrder("TRON", "100");
    await ingestTransfers([transfer("TRON", order.usdtAmount.toString(), { blockTime: new Date(order.createdAt.getTime() - 60_000) })]);
    expect(await statusOf(order.id)).toBe("QUOTE_READY");
  });

  it("the same transfer seen twice is stored and counted once", async () => {
    const { order } = await makeOrder("TRON", "100");
    const t = transfer("TRON", order.usdtAmount.toString());
    await ingestTransfers([t]);
    const again = await ingestTransfers([t]);
    expect(again).toEqual([]);
    expect(await prisma.incomingTransfer.count()).toBe(1);
  });

  it("one BSC transaction with two USDT transfers pays two different orders", async () => {
    const a = await makeOrder("BSC", "100");
    const b = await makeOrder("BSC", "200");
    const txid = "0x" + "ab".repeat(32);
    await ingestTransfers([
      transfer("BSC", a.order.usdtAmount.toString(), { txid, position: 3 }),
      transfer("BSC", b.order.usdtAmount.toString(), { txid, position: 4 }),
    ]);
    const oa = await orderById(a.order.id);
    const ob = await orderById(b.order.id);
    expect(oa.status).toBe("PAYMENT_CONFIRMED");
    expect(ob.status).toBe("PAYMENT_CONFIRMED");
    expect([oa.transferPosition, ob.transferPosition]).toEqual([3, 4]);
  });
});

describe("fake tokens (spec 6, 8.2)", () => {
  for (const n of ["TRON", "BSC"] as NetworkCode[]) {
    it(`${n}: a look-alike 'USDT' from another contract is ignored and logged`, async () => {
      const { order } = await makeOrder(n, "100");
      await ingestTransfers([transfer(n, order.usdtAmount.toString(), { tokenContract: n === "TRON" ? randTron() : randBsc() })]);
      expect(await statusOf(order.id)).toBe("QUOTE_READY");
      expect(await prisma.incomingTransfer.count({ where: { status: "IGNORED_WRONG_TOKEN" } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: "IGNORED_WRONG_TOKEN_TRANSFER" } })).toBe(1);
    });
  }
});

describe("late payments (spec 7.3)", () => {
  it("a payment 20 minutes after expiry is matched and put on hold", async () => {
    const created = new Date(Date.now() - 40 * 60_000);
    const { order } = await makeOrder("TRON", "100", created);
    await expireQuotes();
    expect(await statusOf(order.id)).toBe("EXPIRED");
    const paidAt = new Date(order.quoteExpiresAt.getTime() + 20 * 60_000);
    const ev = await ingestTransfers([transfer("TRON", order.usdtAmount.toString(), { blockTime: paidAt })]);
    expect(ev).toEqual([{ orderId: order.id, kind: "ON_HOLD", reason: HOLD.LATE }]);
    const o = await orderById(order.id);
    expect(o.status).toBe("ON_HOLD");
    expect(o.holdReason).toBe(HOLD.LATE);
    const steps = (await prisma.orderEvent.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } })).map((e) => e.toStatus);
    expect(steps).toEqual(["QUOTE_READY", "EXPIRED", "PAYMENT_CONFIRMED", "ON_HOLD"]);
  });

  it("a late payment before the expiry job ran is also held", async () => {
    const { order } = await makeOrder("TRON", "100", new Date(Date.now() - 20 * 60_000));
    await ingestTransfers([transfer("TRON", order.usdtAmount.toString(), { blockTime: new Date() })]);
    expect((await orderById(order.id)).holdReason).toBe(HOLD.LATE);
  });

  it("after 24 hours an expired order is no longer matched", async () => {
    const { order } = await makeOrder("TRON", "100", new Date(Date.now() - 26 * 3600_000));
    await expireQuotes();
    await ingestTransfers([transfer("TRON", order.usdtAmount.toString(), { blockTime: new Date() })]);
    expect(await statusOf(order.id)).toBe("EXPIRED");
  });
});

describe("matching by TxID (spec 7.3)", () => {
  it("matches the submitted TxID", async () => {
    const { order, user, actor } = await makeOrder("BSC", "100");
    const t = transfer("BSC", order.usdtAmount.toString());
    fakeChain("BSC", { [t.txid]: { transfers: [t] } });
    await submitTxid(order.id, user.id, t.txid, actor);
    const ev = await verifySubmittedTxid(order.id);
    expect(ev[0]).toMatchObject({ orderId: order.id, kind: "CONFIRMED" });
    expect((await orderById(order.id)).txid).toBe(t.txid);
  });

  it("100.02 arriving for a 100.03 order puts the order on hold", async () => {
    const { order, user, actor } = await makeOrder("TRON", "100");
    await prisma.order.update({ where: { id: order.id }, data: { usdtAmount: "100.03" } });
    const t = transfer("TRON", "100.02");
    fakeChain("TRON", { [t.txid]: { transfers: [t] } });
    await submitTxid(order.id, user.id, t.txid, actor);
    await verifySubmittedTxid(order.id);
    const o = await orderById(order.id);
    expect(o.status).toBe("ON_HOLD");
    expect(o.holdReason).toBe(HOLD.AMOUNT);
    expect(D(o.receivedAmount!).toString()).toBe("100.02");
  });

  it("wrong amount without a TxID goes to unmatched (can't be tied to an order safely)", async () => {
    const { order } = await makeOrder("TRON", "100");
    await ingestTransfers([transfer("TRON", D(order.usdtAmount).minus("0.01").toString())]);
    // Might coincidentally equal another suffix; here only one order exists.
    expect(await statusOf(order.id)).toBe("QUOTE_READY");
    expect(await prisma.incomingTransfer.count({ where: { status: "UNMATCHED" } })).toBe(1);
  });

  it("a Tron order given a BNB Smart Chain TxID goes on hold with the different-network reason", async () => {
    const { order, user, actor } = await makeOrder("TRON", "100");
    const bscTransfer = transfer("BSC", order.usdtAmount.toString());
    fakeChain("BSC", { [bscTransfer.txid]: { transfers: [bscTransfer] } });
    await submitTxid(order.id, user.id, bscTransfer.txid, actor);
    const ev = await verifySubmittedTxid(order.id);
    expect(ev).toEqual([{ orderId: order.id, kind: "ON_HOLD", reason: HOLD.OTHER_NETWORK }]);
    expect((await orderById(order.id)).holdReason).toBe(HOLD.OTHER_NETWORK);
    // The BSC transfer is stored for manual linking, not matched.
    await new Promise((r) => setTimeout(r, 200));
    const stored = await prisma.incomingTransfer.findMany();
    expect(stored.every((s) => s.status === "UNMATCHED")).toBe(true);
  });

  it("a TxID already used by another order puts the second order on hold", async () => {
    const a = await makeOrder("TRON", "100");
    const b = await makeOrder("TRON", "100");
    const t = transfer("TRON", a.order.usdtAmount.toString());
    await ingestTransfers([t]); // matched to A by amount
    expect(await statusOf(a.order.id)).toBe("PAYMENT_CONFIRMED");
    fakeChain("TRON", { [t.txid]: { transfers: [t] } });
    await submitTxid(b.order.id, b.user.id, t.txid, b.actor);
    await verifySubmittedTxid(b.order.id);
    const ob = await orderById(b.order.id);
    expect(ob.status).toBe("ON_HOLD");
    expect(ob.holdReason).toBe(HOLD.TXID_USED);
  });

  it("a failed transaction puts the order on hold", async () => {
    const { order, user, actor } = await makeOrder("TRON", "100");
    const t = transfer("TRON", order.usdtAmount.toString());
    fakeChain("TRON", { [t.txid]: { transfers: [t], success: false } });
    await submitTxid(order.id, user.id, t.txid, actor);
    await verifySubmittedTxid(order.id);
    expect((await orderById(order.id)).holdReason).toBe(HOLD.TX_FAILED);
  });

  it("a TxID not yet final is left alone and retried later", async () => {
    const { order, user, actor } = await makeOrder("BSC", "100");
    const t = transfer("BSC", order.usdtAmount.toString());
    fakeChain("BSC", { [t.txid]: { transfers: [t], final: false } });
    await submitTxid(order.id, user.id, t.txid, actor);
    expect(await verifySubmittedTxid(order.id)).toEqual([]);
    expect(await statusOf(order.id)).toBe("PAYMENT_SUBMITTED");
  });
});

describe("deposit address changes", () => {
  it("open orders keep matching the old address after a change", async () => {
    const { order } = await makeOrder("BSC", "100");
    const newAddr = randBsc();
    await prisma.setting.update({ where: { key: "deposit_address" }, data: { value: { TEST: { TRON: ADDR.TRON, BSC: newAddr }, LIVE: { TRON: "", BSC: "" } } } });
    const next = await makeOrder("BSC", "100");
    expect(next.order.depositAddress).toBe(newAddr);
    // Payment to the OLD address for the old order.
    await ingestTransfers([transfer("BSC", order.usdtAmount.toString(), { to: ADDR.BSC })]);
    expect(await statusOf(order.id)).toBe("PAYMENT_CONFIRMED");
    // Same amount to the new address doesn't match the old order.
    await ingestTransfers([transfer("BSC", next.order.usdtAmount.toString(), { to: newAddr })]);
    expect(await statusOf(next.order.id)).toBe("PAYMENT_CONFIRMED");
  });
});
