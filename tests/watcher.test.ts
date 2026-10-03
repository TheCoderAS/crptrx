import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeAbiParameters, getAddress, pad } from "viem";
import { prisma } from "@/server/db";
import { setAdapterForTests, getAdapter } from "@/server/networks";
import { bscAdapter, resetLearnedSpanForTests, setBscClientForTests } from "@/server/networks/bsc";
import { tronAdapter } from "@/server/networks/tron";
import { toUnits } from "@/server/money";
import { networkTick, recordWatcherFailure, delayedNetworks, watchOnce } from "@/server/watcher";
import { recheckPayment } from "@/server/matching";
import { ADDR, TOKEN, baseSettings, makeOrder, orderById, randBsc, resetDb } from "./helpers";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

interface FakeLog { blockNumber: bigint; logIndex: number; txid: string; to: string; amount: string; token?: string; from?: string }

/** Minimal fake of the viem client calls the BSC adapter makes. */
function fakeBsc(logs: FakeLog[], opts: { finalized: bigint; failGetLogsAt?: bigint; maxRange?: bigint }) {
  const calls: [bigint, bigint][] = [];
  const client = {
    calls,
    finalized: opts.finalized,
    async getBlock(a: { blockTag?: string; blockNumber?: bigint }) {
      if (a.blockTag === "finalized") return { number: client.finalized };
      return { timestamp: BigInt(Math.floor(Date.now() / 1000) + 60) };
    },
    async getBlockNumber() {
      return client.finalized + 20n;
    },
    async getLogs(a: { fromBlock: bigint; toBlock: bigint; args?: { to: string[] }; address: string }) {
      if (opts.maxRange && a.toBlock - a.fromBlock + 1n > opts.maxRange) throw new Error("Request exceeds defined limit.");
      calls.push([a.fromBlock, a.toBlock]);
      if (opts.failGetLogsAt !== undefined && a.fromBlock <= opts.failGetLogsAt && opts.failGetLogsAt <= a.toBlock) {
        throw new Error("provider died"); // keeps failing until the process restarts
      }
      const tos = a.args?.to.map((x) => x.toLowerCase());
      return logs
        .filter((l) => l.blockNumber >= a.fromBlock && l.blockNumber <= a.toBlock && (!tos || tos.includes(l.to.toLowerCase())) && (l.token ?? TOKEN.BSC).toLowerCase() === a.address.toLowerCase())
        .map((l) => ({
          address: getAddress(l.token ?? TOKEN.BSC),
          topics: [TRANSFER_TOPIC, pad((l.from ?? randBsc()) as `0x${string}`), pad(l.to as `0x${string}`)],
          data: encodeAbiParameters([{ type: "uint256" }], [toUnits(l.amount, 18)]),
          transactionHash: l.txid,
          logIndex: l.logIndex,
          blockNumber: l.blockNumber,
          removed: false,
        }));
    },
    // Like the free PublicNode address: single-transaction lookups are refused.
    // Scanning must not need them.
    async getTransactionReceipt() {
      throw new Error("Archive requests require a personal token.");
    },
    // Plain transaction lookups do work there.
    async getTransaction(a: { hash: string }) {
      const l = logs.find((x) => x.txid === a.hash);
      if (!l) throw Object.assign(new Error("not found"), { name: "TransactionNotFoundError" });
      return { hash: l.txid, blockNumber: l.blockNumber };
    },
  };
  return client;
}

beforeEach(async () => {
  await resetDb();
  await baseSettings({ bsc_scan_range: 10, bsc_initial_lookback_blocks: 50 });
});
afterEach(() => {
  resetLearnedSpanForTests();
  setBscClientForTests(null);
  setAdapterForTests("TRON", tronAdapter);
  setAdapterForTests("BSC", bscAdapter);
});

const tx = (n: number) => "0x" + n.toString(16).padStart(64, "0");

describe("BSC watcher (spec 8.3, M6b)", () => {
  it("reads in ranges up to the final block and saves the cursor", async () => {
    const { order } = await makeOrder("BSC", "100");
    const c = fakeBsc([{ blockNumber: 975n, logIndex: 0, txid: tx(1), to: ADDR.BSC, amount: order.usdtAmount.toString() }], { finalized: 1000n });
    setBscClientForTests(c);
    for (let i = 0; i < 6; i++) await watchOnce("BSC");
    // First pass starts at finalized - lookback = 950, ranges of 10, never past 1000.
    expect(c.calls[0]).toEqual([950n, 959n]);
    expect(c.calls.at(-1)![1]).toBeLessThanOrEqual(1000n);
    expect((await orderById(order.id)).status).toBe("PAYMENT_CONFIRMED");
    const st = await prisma.watcherState.findUniqueOrThrow({ where: { network: "BSC" } });
    expect((st.cursor as Record<string, { lastBlock: string }>).TEST.lastBlock).toBe("1000");
  });

  it("a restart mid-range neither skips nor repeats a transfer", async () => {
    const a = await makeOrder("BSC", "100");
    const b = await makeOrder("BSC", "200");
    const logs: FakeLog[] = [
      { blockNumber: 952n, logIndex: 0, txid: tx(10), to: ADDR.BSC, amount: a.order.usdtAmount.toString() },
      { blockNumber: 965n, logIndex: 1, txid: tx(11), to: ADDR.BSC, amount: b.order.usdtAmount.toString() },
    ];
    const c = fakeBsc(logs, { finalized: 1000n, failGetLogsAt: 965n });
    setBscClientForTests(c);
    await watchOnce("BSC"); // 950-959 ok
    await expect(watchOnce("BSC")).rejects.toThrow(); // 960-969 fails even after retries
    // "Restart": a brand-new client instance, same chain.
    const c2 = fakeBsc(logs, { finalized: 1000n });
    setBscClientForTests(c2);
    for (let i = 0; i < 5; i++) await watchOnce("BSC");
    expect(c2.calls[0]).toEqual([960n, 969n]); // resumes exactly where it stopped
    expect(await prisma.incomingTransfer.count()).toBe(2);
    expect((await orderById(a.order.id)).status).toBe("PAYMENT_CONFIRMED");
    expect((await orderById(b.order.id)).status).toBe("PAYMENT_CONFIRMED");
  });

  it("a TxID the provider won't look up doesn't stop the scan or mark the network failing", async () => {
    const paid = await makeOrder("BSC", "100");
    const waiting = await makeOrder("BSC", "200");
    // A customer pasted a TxID; the provider refuses single-transaction lookups (fakeBsc, like PublicNode).
    await prisma.order.update({ where: { id: waiting.order.id }, data: { status: "PAYMENT_SUBMITTED", submittedTxid: tx(99) } });
    const c = fakeBsc([{ blockNumber: 975n, logIndex: 0, txid: tx(1), to: ADDR.BSC, amount: paid.order.usdtAmount.toString() }], { finalized: 1000n });
    setBscClientForTests(c);
    for (let i = 0; i < 6; i++) await networkTick("BSC");
    expect((await orderById(paid.order.id)).status).toBe("PAYMENT_CONFIRMED");
    expect((await orderById(waiting.order.id)).status).toBe("PAYMENT_SUBMITTED"); // tried again next time
    const st = await prisma.watcherState.findUniqueOrThrow({ where: { network: "BSC" } });
    expect(st.failingSince).toBeNull();
  });

  it("does not read blocks that are not final yet", async () => {
    const { order } = await makeOrder("BSC", "100");
    const c = fakeBsc([{ blockNumber: 1005n, logIndex: 0, txid: tx(2), to: ADDR.BSC, amount: order.usdtAmount.toString() }], { finalized: 1000n });
    setBscClientForTests(c);
    for (let i = 0; i < 8; i++) await watchOnce("BSC");
    expect((await orderById(order.id)).status).toBe("QUOTE_READY");
    c.finalized = 1010n;
    await watchOnce("BSC");
    expect((await orderById(order.id)).status).toBe("PAYMENT_CONFIRMED");
  });
});

describe("provider block-range limits", () => {
  it("shrinks the request when the provider refuses a range, without skipping blocks", async () => {
    await baseSettings({ bsc_scan_range: 500, bsc_initial_lookback_blocks: 50 });
    const { order } = await makeOrder("BSC", "100");
    // Real public BSC testnet nodes reject large eth_getLogs ranges ("exceeds defined limit").
    const c = fakeBsc([{ blockNumber: 985n, logIndex: 0, txid: tx(21), to: ADDR.BSC, amount: order.usdtAmount.toString() }], { finalized: 1000n, maxRange: 20n });
    setBscClientForTests(c);
    for (let i = 0; i < 6; i++) await watchOnce("BSC");
    // Every accepted call is within the limit, and the covered ranges are contiguous from 950.
    expect(c.calls.every(([f, t]) => t - f + 1n <= 20n)).toBe(true);
    expect(c.calls[0][0]).toBe(950n);
    for (let i = 1; i < c.calls.length; i++) expect(c.calls[i][0]).toBe(c.calls[i - 1][1] + 1n);
    expect((await orderById(order.id)).status).toBe("PAYMENT_CONFIRMED");
  });

  it("still fails loudly on errors that aren't range limits", async () => {
    await makeOrder("BSC", "100");
    setBscClientForTests(fakeBsc([], { finalized: 1000n, failGetLogsAt: 955n }));
    await expect(watchOnce("BSC")).rejects.toThrow(/provider died/);
  });
});

describe("network isolation", () => {
  it("a Tron outage doesn't stop BSC matching", async () => {
    const bsc = await makeOrder("BSC", "100");
    setAdapterForTests("TRON", { ...getAdapter("TRON"), scan: async () => { throw new Error("TronGrid down"); } });
    setBscClientForTests(fakeBsc([{ blockNumber: 912n, logIndex: 0, txid: tx(3), to: ADDR.BSC, amount: bsc.order.usdtAmount.toString() }], { finalized: 960n }));
    const results = await Promise.allSettled([networkTick("TRON"), networkTick("BSC")]);
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("fulfilled");
    expect((await orderById(bsc.order.id)).status).toBe("PAYMENT_CONFIRMED");
    const st = await prisma.watcherState.findUniqueOrThrow({ where: { network: "TRON" } });
    expect(st.lastError).toContain("TronGrid down");
  }, 20_000);

  it("alerts super admins once after 10 minutes of failures and shows the banner", async () => {
    await prisma.admin.create({ data: { name: "Owner", email: "owner@test.dev", passwordHash: "x", role: "SUPER_ADMIN" } });
    const t0 = new Date(Date.now() - 11 * 60_000);
    await recordWatcherFailure("TRON", new Error("down"), t0);
    await recordWatcherFailure("TRON", new Error("down"), new Date());
    await recordWatcherFailure("TRON", new Error("down"), new Date());
    expect(await prisma.outboundMessage.count({ where: { to: "owner@test.dev" } })).toBe(1);
    expect(await delayedNetworks()).toEqual(["TRON"]);
  });
});

describe("TxID check when the provider refuses receipt lookups (free PublicNode)", () => {
  it("confirms a customer's payment from the transaction's block", async () => {
    const { order, user } = await makeOrder("BSC", "100");
    const c = fakeBsc([{ blockNumber: 975n, logIndex: 3, txid: tx(50), to: ADDR.BSC, amount: order.usdtAmount.toString() }], { finalized: 1000n });
    setBscClientForTests(c);
    await prisma.order.update({ where: { id: order.id }, data: { status: "PAYMENT_SUBMITTED", submittedTxid: tx(50) } });
    await recheckPayment(order.id, { type: "USER", id: user.id }, user.id);
    expect((await orderById(order.id)).status).toBe("PAYMENT_CONFIRMED");
  });

  it("holds an order whose TxID is our deposit wallet paying itself", async () => {
    const { order, user } = await makeOrder("BSC", "100");
    const c = fakeBsc([{ blockNumber: 975n, logIndex: 0, txid: tx(51), from: ADDR.BSC, to: ADDR.BSC, amount: order.usdtAmount.toString() }], { finalized: 1000n });
    setBscClientForTests(c);
    await prisma.order.update({ where: { id: order.id }, data: { status: "PAYMENT_SUBMITTED", submittedTxid: tx(51) } });
    await recheckPayment(order.id, { type: "USER", id: user.id }, user.id);
    const o = await orderById(order.id);
    expect(o.status).toBe("ON_HOLD");
    expect((await prisma.incomingTransfer.findFirstOrThrow({ where: { txid: tx(51) } })).unmatchedReason).toMatch(/own deposit address/);
  });

  it("says the blockchain couldn't be reached instead of a generic error", async () => {
    const { order, user } = await makeOrder("BSC", "100");
    const c = fakeBsc([], { finalized: 1000n });
    c.getTransaction = async () => {
      throw new Error("provider down");
    };
    setBscClientForTests(c);
    await prisma.order.update({ where: { id: order.id }, data: { status: "PAYMENT_SUBMITTED", submittedTxid: tx(52) } });
    await expect(recheckPayment(order.id, { type: "USER", id: user.id }, user.id)).rejects.toMatchObject({ status: 503, message: /Couldn't reach the blockchain/ });
  });
});
