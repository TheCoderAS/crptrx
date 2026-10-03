import {
  createPublicClient,
  fallback,
  getAddress,
  http,
  isAddress,
  parseAbiItem,
  type PublicClient,
  type Log,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { NETWORK_INFO, explorerTxUrl } from "@/lib/networks";
import { env } from "../env";
import { fromUnits } from "../money";
import type { ChainTransfer, NetworkAdapter, NetworkContext, TxLookup } from "./types";

const DECIMALS = NETWORK_INFO.BSC.decimals;
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const clients = new Map<string, PublicClient>();
let testClient: PublicClient | null = null;
/** Lets tests run the real adapter against a fake chain. */
export function setBscClientForTests(c: unknown) {
  testClient = c as PublicClient | null;
}
function client(ctx: NetworkContext): PublicClient {
  if (testClient) return testClient;
  const live = ctx.mode === "LIVE";
  const urls = (live ? [env.bsc.liveRpcUrl, env.bsc.liveRpcBackupUrl] : [env.bsc.testRpcUrl, env.bsc.testRpcBackupUrl]).filter(
    (u): u is string => !!u,
  );
  if (urls.length === 0) throw new Error("No BNB Smart Chain data provider configured (BSC_LIVE_RPC_URL)");
  const key = `${ctx.mode}:${urls.join(",")}`;
  let c = clients.get(key);
  if (!c) {
    c = createPublicClient({
      chain: live ? bsc : bscTestnet,
      // Primary provider first; switch to the backup automatically on failure.
      transport: fallback(urls.map((u) => http(u, { timeout: 15_000, retryCount: 2 }))),
    }) as PublicClient;
    clients.set(key, c);
  }
  return c;
}

/** Highest block we treat as final: provider's `finalized` tag, else latest − N (setting). */
async function finalizedBlock(c: PublicClient, ctx: NetworkContext): Promise<bigint> {
  try {
    const b = await c.getBlock({ blockTag: "finalized" });
    if (b?.number != null) return b.number;
  } catch {
    /* provider without `finalized` support */
  }
  const latest = await c.getBlockNumber();
  return latest - BigInt(ctx.finalityFallbackBlocks);
}

const blockTimes = new Map<bigint, Date>();
async function blockTime(c: PublicClient, n: bigint): Promise<Date> {
  const hit = blockTimes.get(n);
  if (hit) return hit;
  const b = await c.getBlock({ blockNumber: n });
  const t = new Date(Number(b.timestamp) * 1000);
  if (blockTimes.size > 5000) blockTimes.clear();
  blockTimes.set(n, t);
  return t;
}

const topicAddr = (t: string) => getAddress("0x" + t.slice(-40));

/** Providers reject eth_getLogs over too many blocks, each with its own wording. */
export function isRangeLimitError(e: unknown): boolean {
  const err = e as { message?: string; details?: string; shortMessage?: string };
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.shortMessage ?? ""}`;
  return /limit|exceed|too many|block range|range is too|query returned more than|response size/i.test(text);
}

// Largest block span the current provider accepted, learned at run time.
let learnedSpan: bigint | null = null;
export function resetLearnedSpanForTests() {
  learnedSpan = null;
}

/**
 * Read Transfer logs for [from, to]. If the provider refuses the range, halve
 * it and retry, down to a single block. Returns the logs and the last block
 * actually covered (may be below `to`), so the cursor never skips a block.
 */
export async function getTransferLogsAdaptive(
  c: PublicClient,
  params: { token: string; to?: string[]; fromBlock: bigint; toBlock: bigint },
) {
  let span = params.toBlock - params.fromBlock + 1n;
  if (learnedSpan !== null && learnedSpan < span) span = learnedSpan;
  for (;;) {
    const end = params.fromBlock + span - 1n;
    try {
      const logs = await c.getLogs({
        address: getAddress(params.token),
        event: TRANSFER,
        args: params.to ? { to: params.to.map((a) => getAddress(a)) } : undefined,
        fromBlock: params.fromBlock,
        toBlock: end,
      });
      return { logs, coveredTo: end };
    } catch (e) {
      if (!isRangeLimitError(e)) throw e;
      if (span <= 1n)
        throw new Error(
          "The BNB Smart Chain data provider refuses log queries even for one block (it doesn't support eth_getLogs). " +
            "Set BSC_TEST_RPC_URL / BSC_LIVE_RPC_URL to a provider that does.",
        );
      span = span / 2n;
      learnedSpan = span;
    }
  }
}

export function decodeBscLog(log: Pick<Log, "address" | "topics" | "data" | "transactionHash" | "logIndex" | "blockNumber">, time: Date): ChainTransfer | null {
  const topics = log.topics as string[];
  if (!topics[0] || topics[0].toLowerCase() !== TRANSFER_TOPIC || topics.length < 3) return null;
  const raw = BigInt(log.data === "0x" ? 0 : log.data);
  return {
    network: "BSC",
    txid: log.transactionHash!.toLowerCase(),
    position: Number(log.logIndex),
    tokenContract: getAddress(log.address),
    from: topicAddr(topics[1]),
    to: topicAddr(topics[2]),
    rawAmount: raw,
    amount: fromUnits(raw, DECIMALS),
    blockNumber: BigInt(log.blockNumber!),
    blockTime: time,
    raw: { ...log, blockNumber: log.blockNumber?.toString(), logIndex: log.logIndex },
  };
}

/**
 * TxID lookup for providers that refuse eth_getTransactionReceipt. A Transfer
 * event only exists if the transaction succeeded, so finding one proves
 * success. Only the official token is read (a whole block of every token's
 * events is too big for free providers); with none found the transaction is
 * reported as successful with no transfers, which matching treats as "didn't
 * pay us" and holds for an admin.
 */
async function lookupWithoutReceipt(c: PublicClient, txid: string, ctx: NetworkContext): Promise<TxLookup> {
  let txn;
  try {
    txn = await c.getTransaction({ hash: txid as `0x${string}` });
  } catch (e) {
    if ((e as Error).name === "TransactionNotFoundError") return { found: false, success: false, final: false, transfers: [] };
    throw e;
  }
  if (txn.blockNumber == null) return { found: false, success: false, final: false, transfers: [] }; // not in a block yet
  const fin = await finalizedBlock(c, ctx);
  if (txn.blockNumber > fin) return { found: true, success: false, final: false, transfers: [] };
  const logs = await c.getLogs({ address: getAddress(ctx.tokenContract), event: TRANSFER, fromBlock: txn.blockNumber, toBlock: txn.blockNumber });
  const time = await blockTime(c, txn.blockNumber);
  const transfers = logs
    .filter((l) => !l.removed && l.transactionHash?.toLowerCase() === txid.toLowerCase())
    .map((l) => decodeBscLog(l, time))
    .filter((t): t is ChainTransfer => !!t);
  return { found: true, success: true, final: true, transfers };
}

export const bscAdapter: NetworkAdapter = {
  code: "BSC",
  decimals: DECIMALS,
  // Accept all-lowercase or correctly checksummed (EIP-55) mixed case only.
  isValidAddress: (a) => /^0x[0-9a-fA-F]{40}$/.test(a.trim()) && isAddress(a.trim(), { strict: true }),
  canonicalAddress: (a) => getAddress(a.trim()),
  normalizeAddress: (a) => a.trim().toLowerCase(),
  isTxid: (t) => /^0x[0-9a-fA-F]{64}$/.test(t.trim()),
  normalizeTxid: (t) => t.trim().toLowerCase(),
  explorerTxUrl: (txid, mode) => explorerTxUrl("BSC", mode, txid),

  async lookupTx(txid, ctx): Promise<TxLookup> {
    const c = client(ctx);
    let receipt;
    try {
      receipt = await c.getTransactionReceipt({ hash: txid as `0x${string}` });
    } catch (e) {
      if ((e as Error).name === "TransactionReceiptNotFoundError") return { found: false, success: false, final: false, transfers: [] };
      // Free providers (PublicNode) refuse receipt lookups. Find the block from the
      // transaction itself, then read that one block's token Transfer events.
      return lookupWithoutReceipt(c, txid, ctx);
    }
    const fin = await finalizedBlock(c, ctx);
    const time = await blockTime(c, receipt.blockNumber);
    const transfers = receipt.logs.map((l) => decodeBscLog(l, time)).filter((t): t is ChainTransfer => !!t);
    return { found: true, success: receipt.status === "success", final: receipt.blockNumber <= fin, transfers };
  },

  /**
   * Reads Transfer events of the official token to the watched addresses in
   * block ranges up to the final block. Cursor = { lastBlock } — the last
   * block fully processed — so a restart neither skips nor repeats a range.
   */
  async scan(addresses, cursor, ctx) {
    const c = client(ctx);
    const fin = await finalizedBlock(c, ctx);
    const last = (cursor as { lastBlock?: string } | null)?.lastBlock;
    const from = last != null ? BigInt(last) + 1n : fin - BigInt(ctx.initialLookback);
    if (from > fin) return { transfers: [], cursor: { lastBlock: (from - 1n).toString() } };
    const wanted = from + BigInt(ctx.scanRange) - 1n < fin ? from + BigInt(ctx.scanRange) - 1n : fin;
    if (addresses.length === 0) return { transfers: [], cursor: { lastBlock: wanted.toString() } };

    const { logs, coveredTo: to } = await getTransferLogsAdaptive(c, { token: ctx.tokenContract, to: addresses, fromBlock: from, toBlock: wanted });
    const out: ChainTransfer[] = [];
    // A Transfer event only exists if its transaction succeeded: a failed (reverted)
    // transaction leaves no events at all. So there is no per-transaction lookup here,
    // which free providers refuse ("archive requests"), and the scan stays fast.
    for (const log of logs) {
      if (log.removed) continue;
      const t = decodeBscLog(log, await blockTime(c, log.blockNumber!));
      if (t) out.push(t);
    }
    return { transfers: out, cursor: { lastBlock: to.toString() } };
  },
};
