import { describe, expect, it } from "vitest";
import type { Order } from "@prisma/client";
import { encodeFunctionData, erc20Abi } from "viem";
import { tronBase58ToHex } from "@/server/networks/tronAddress";
import { broadcastTronTransfer, tronTransferData } from "@/server/tronPay";
import { randTron } from "./helpers";

const deposit = randTron();
const token = randTron();
const order = { depositAddress: deposit, usdtAmount: "10.5", networkMode: "TEST" } as unknown as Order;
const signed = (over: { owner?: string; contract?: string; data?: string } = {}) => ({
  txID: "ab".repeat(32),
  signature: ["sig"],
  raw_data: { contract: [{ parameter: { value: { owner_address: over.owner ?? randTron(), contract_address: over.contract ?? token, data: over.data ?? tronTransferData(deposit, 10_500_000n) } } }] },
});

describe("Tron wallet-app payments", () => {
  it("encodes transfer(to, amount) exactly like the standard token call", () => {
    const to = randTron();
    const evm = ("0x" + tronBase58ToHex(to).slice(2)) as `0x${string}`;
    expect(tronTransferData(to, 123n)).toBe(encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [evm, 123n] }).slice(2));
  });

  it("refuses a signed payment for a different amount", async () => {
    await expect(broadcastTronTransfer(order, token, signed({ data: tronTransferData(deposit, 1n) }))).rejects.toThrow(/doesn't match/);
  });

  it("refuses a signed payment to a different address", async () => {
    await expect(broadcastTronTransfer(order, token, signed({ data: tronTransferData(randTron(), 10_500_000n) }))).rejects.toThrow(/doesn't match/);
  });

  it("refuses a different token", async () => {
    await expect(broadcastTronTransfer(order, token, signed({ contract: randTron() }))).rejects.toThrow(/doesn't match/);
  });

  it("refuses a payment from our own deposit wallet", async () => {
    await expect(broadcastTronTransfer(order, token, signed({ owner: deposit }))).rejects.toThrow(/deposit address/);
  });

  it("refuses something that isn't signed", async () => {
    await expect(broadcastTronTransfer(order, token, { ...signed(), signature: [] })).rejects.toThrow(/signed/);
  });
});
