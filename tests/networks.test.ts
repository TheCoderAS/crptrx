import { describe, expect, it } from "vitest";
import { bscAdapter, decodeBscLog } from "@/server/networks/bsc";
import { decodeTronTxInfo, tronAdapter } from "@/server/networks/tron";
import { isValidTronAddress, tronBase58ToHex, tronHexToBase58 } from "@/server/networks/tronAddress";
import { txidNetwork } from "@/lib/networks";

const USDT_TRON = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

describe("address checks", () => {
  it("accepts the official Tron USDT contract and round-trips hex", () => {
    expect(isValidTronAddress(USDT_TRON)).toBe(true);
    expect(tronHexToBase58(tronBase58ToHex(USDT_TRON))).toBe(USDT_TRON);
  });
  it("rejects a Tron address with a broken checksum", () => {
    const bad = USDT_TRON.slice(0, -1) + (USDT_TRON.endsWith("t") ? "u" : "t");
    expect(isValidTronAddress(bad)).toBe(false);
  });
  it("BSC: accepts checksummed or all-lowercase, rejects bad mixed-case checksum", () => {
    expect(bscAdapter.isValidAddress(USDT_BSC)).toBe(true);
    expect(bscAdapter.isValidAddress(USDT_BSC.toLowerCase())).toBe(true);
    expect(bscAdapter.isValidAddress(USDT_BSC.replace("fF", "Ff"))).toBe(false);
  });
  it("a Tron address is not a BSC address and vice versa", () => {
    expect(bscAdapter.isValidAddress(USDT_TRON)).toBe(false);
    expect(tronAdapter.isValidAddress(USDT_BSC)).toBe(false);
  });
  it("BSC comparisons are lowercase", () => {
    expect(bscAdapter.normalizeAddress(USDT_BSC)).toBe(USDT_BSC.toLowerCase());
  });
  it("detects a TxID's network from its format", () => {
    expect(txidNetwork("0x" + "a".repeat(64))).toBe("BSC");
    expect(txidNetwork("a".repeat(64))).toBe("TRON");
    expect(txidNetwork("xyz")).toBeNull();
  });
});

describe("decoding transfers", () => {
  const pad = (hex: string) => "0".repeat(24) + hex;
  it("decodes Tron solidified tx info with 6 decimals and log positions", () => {
    const toHex = tronBase58ToHex("TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7").slice(2);
    const fromHex = tronBase58ToHex(USDT_TRON).slice(2);
    const r = decodeTronTxInfo("ABC", {
      id: "abc",
      blockNumber: 123,
      blockTimeStamp: 1_700_000_000_000,
      receipt: { result: "SUCCESS" },
      log: [
        { address: "11".repeat(20), topics: ["deadbeef"], data: "" },
        {
          address: tronBase58ToHex(USDT_TRON).slice(2),
          topics: ["ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad(fromHex), pad(toHex)],
          data: (100030000n).toString(16).padStart(64, "0"),
        },
      ],
    });
    expect(r.found && r.success && r.final).toBe(true);
    expect(r.transfers).toHaveLength(1);
    const t = r.transfers[0];
    expect(t.position).toBe(1);
    expect(t.amount.toString()).toBe("100.03");
    expect(t.tokenContract).toBe(USDT_TRON);
    expect(t.to).toBe("TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7");
    expect(t.txid).toBe("abc");
  });
  it("marks a failed Tron tx as unsuccessful", () => {
    expect(decodeTronTxInfo("a", { id: "a", receipt: { result: "REVERT" } }).success).toBe(false);
    expect(decodeTronTxInfo("a", {}).found).toBe(false);
  });
  it("decodes a BSC Transfer log with 18 decimals", () => {
    const t = decodeBscLog(
      {
        address: USDT_BSC,
        topics: [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
          ("0x" + pad("1".repeat(40))) as `0x${string}`,
          ("0x" + pad("2".repeat(40))) as `0x${string}`,
        ] as never,
        data: ("0x" + (100030000000000000000n).toString(16)) as `0x${string}`,
        transactionHash: ("0x" + "AB".repeat(32)) as `0x${string}`,
        logIndex: 7,
        blockNumber: 42n,
      },
      new Date(0),
    )!;
    expect(t.amount.toString()).toBe("100.03");
    expect(t.position).toBe(7);
    expect(t.txid).toBe("0x" + "ab".repeat(32));
    expect(t.to.toLowerCase()).toBe("0x" + "2".repeat(40));
  });
});
