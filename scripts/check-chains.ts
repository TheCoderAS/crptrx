/**
 * Live check of the blockchain readers against the real test networks
 * (Tron Nile + BSC Testnet). Needs internet; no database.
 *
 * For each network it finds a recent real transfer of the configured test
 * USDT token, then checks that our adapter:
 *   1. looks the transaction up by TxID (success + final + decoded amount), and
 *   2. finds the same transfer when scanning the receiver's address.
 * It also shows whether the test token contract actually has activity.
 *
 * Usage: npx tsx scripts/check-chains.ts
 * Override tokens with CHECK_TRON_TOKEN / CHECK_BSC_TOKEN.
 */
import { createPublicClient, fallback, getAddress, http, parseAbiItem } from "viem";
import { bscTestnet } from "viem/chains";
import { NETWORK_INFO } from "@/lib/networks";
import { env } from "@/server/env";
import { bscAdapter } from "@/server/networks/bsc";
import { tronAdapter } from "@/server/networks/tron";
import type { NetworkContext } from "@/server/networks/types";
import { SETTING_DEFAULTS } from "@/server/settings";

const results: { check: string; ok: boolean; detail: string }[] = [];
const record = (check: string, ok: boolean, detail: string) => {
  results.push({ check, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${check}: ${detail}`);
};

const baseCtx = { mode: "TEST" as const, finalityFallbackBlocks: 15, scanRange: 500, initialLookback: 200 };

async function checkTron() {
  const token = process.env.CHECK_TRON_TOKEN || SETTING_DEFAULTS.test_token_contract.TRON;
  const ctx: NetworkContext = { ...baseCtx, tokenContract: token };
  console.log(`\n== Tron Nile, token ${token} (${env.tron.testApiUrl})`);
  const headers: Record<string, string> = env.tron.apiKey ? { "TRON-PRO-API-KEY": env.tron.apiKey } : {};
  const res = await fetch(`${env.tron.testApiUrl}/v1/contracts/${token}/events?event_name=Transfer&only_confirmed=true&limit=50`, { headers });
  if (!res.ok) return record("tron: list token events", false, `HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { transaction_id: string; block_timestamp: number }[] };
  const events = body.data ?? [];
  record("tron: test token has recent transfers", events.length > 0, `${events.length} recent Transfer events`);
  if (!events.length) return;

  // Newest confirmed event that walletsolidity already has.
  for (const ev of events) {
    const tx = await tronAdapter.lookupTx(ev.transaction_id, ctx);
    if (!tx.found) continue;
    record("tron: lookup by TxID", tx.success && tx.final, `tx ${ev.transaction_id} found=${tx.found} success=${tx.success} final=${tx.final}`);
    const mine = tx.transfers.find((t) => t.tokenContract === token);
    record("tron: decoded token transfer", !!mine, mine ? `${mine.amount.toFixed()} USDT to ${mine.to} (log #${mine.position}, block ${mine.blockNumber})` : "no transfer of the token decoded");
    if (!mine) return;
    const scan = await tronAdapter.scan([mine.to], { [mine.to]: mine.blockTime.getTime() - 60_000 }, ctx);
    const hit = scan.transfers.find((t) => t.txid === mine.txid && t.position === mine.position);
    record("tron: address scan finds the same transfer", !!hit && hit.amount.eq(mine.amount), hit ? `found, amount ${hit.amount.toFixed()}` : `${scan.transfers.length} transfers returned, none matched`);
    return;
  }
  record("tron: lookup by TxID", false, "none of the recent events were in solidified data yet");
}

async function checkBsc() {
  const token = getAddress(process.env.CHECK_BSC_TOKEN || SETTING_DEFAULTS.test_token_contract.BSC);
  const ctx: NetworkContext = { ...baseCtx, tokenContract: token };
  console.log(`\n== BSC Testnet, token ${token} (${env.bsc.testRpcUrl})`);
  const c = createPublicClient({ chain: bscTestnet, transport: fallback([http(env.bsc.testRpcUrl), http(env.bsc.testRpcBackupUrl!)]) });
  let fin: bigint;
  try {
    const b = await c.getBlock({ blockTag: "finalized" });
    fin = b.number!;
    record("bsc: provider supports 'finalized'", true, `finalized block ${fin}`);
  } catch (e) {
    fin = (await c.getBlockNumber()) - 15n;
    record("bsc: provider supports 'finalized'", false, `falls back to latest-15 (${(e as Error).message.slice(0, 80)})`);
  }
  const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
  let logs: Awaited<ReturnType<typeof c.getLogs<typeof TRANSFER>>> = [];
  let to = fin;
  for (let i = 0; i < 40 && logs.length === 0; i++) {
    const from = to - 999n;
    logs = await c.getLogs({ address: token, event: TRANSFER, fromBlock: from, toBlock: to });
    to = from - 1n;
  }
  record("bsc: test token has recent transfers", logs.length > 0, `${logs.length} Transfer logs in the last ~${Number(fin - to)} blocks`);
  if (!logs.length) return;
  const log = logs[logs.length - 1];
  const tx = await bscAdapter.lookupTx(log.transactionHash!, ctx);
  record("bsc: lookup by TxID", tx.found && tx.success && tx.final, `tx ${log.transactionHash} found=${tx.found} success=${tx.success} final=${tx.final}`);
  const mine = tx.transfers.find((t) => t.position === Number(log.logIndex));
  const expected = BigInt(log.args.value!);
  record("bsc: decoded amount matches chain (18 decimals)", !!mine && mine.rawAmount === expected, mine ? `${mine.amount.toFixed()} USDT (raw ${mine.rawAmount})` : "log not decoded");
  if (!mine) return;
  const scan = await bscAdapter.scan([mine.to], { lastBlock: (mine.blockNumber - 1n).toString() }, { ...ctx, scanRange: 5 });
  const hit = scan.transfers.find((t) => t.txid === mine.txid && t.position === mine.position);
  record("bsc: address scan finds the same transfer", !!hit, hit ? `found in block ${hit.blockNumber}, cursor now ${JSON.stringify(scan.cursor)}` : `${scan.transfers.length} transfers returned, none matched`);
}

async function main() {
  console.log(`Decimals: Tron ${NETWORK_INFO.TRON.decimals}, BSC ${NETWORK_INFO.BSC.decimals}`);
  for (const [name, fn] of [["tron", checkTron], ["bsc", checkBsc]] as const) {
    try {
      await fn();
    } catch (e) {
      record(`${name}: unexpected error`, false, (e as Error).message);
    }
  }
  const failed = results.filter((r) => !r.ok && !r.check.includes("supports 'finalized'"));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

main();
