/**
 * Live check of the blockchain readers against the real test networks
 * (Tron Nile + BSC Testnet), plus the real BNB Smart Chain with the official
 * USDT contract (read-only, nothing is sent). Needs internet; no database.
 *
 * For each network it finds a recent real transfer of the configured test
 * USDT token, then checks that our adapter:
 *   1. looks the transaction up by TxID (success + final + decoded amount), and
 *   2. finds the same transfer when scanning the receiver's address.
 * It also shows whether the test token contract actually has activity.
 *
 * Usage: npx tsx scripts/check-chains.ts
 * Override tokens with CHECK_TRON_TOKEN / CHECK_BSC_TOKEN.
 * The real-network check uses BSC_LIVE_RPC_URL (default: the free PublicNode address).
 */
import { createPublicClient, getAddress, http } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { NETWORK_INFO } from "@/lib/networks";
import { env } from "@/server/env";
import { bscAdapter, getTransferLogsAdaptive, resetLearnedSpanForTests } from "@/server/networks/bsc";
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

/** Free BSC testnet endpoints to probe; the first that serves eth_getLogs is used. */
const BSC_CANDIDATES = [
  process.env.BSC_TEST_RPC_URL,
  "https://bsc-testnet-rpc.publicnode.com",
  "https://bsc-testnet.drpc.org",
  "https://bsc-testnet.bnbchain.org",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
].filter((u, i, a): u is string => !!u && a.indexOf(u) === i);

async function probeBsc(url: string, token: `0x${string}`) {
  const c = createPublicClient({ chain: bscTestnet, transport: http(url, { timeout: 15_000, retryCount: 0 }) });
  const latest = await c.getBlockNumber();
  let finalized = false;
  try {
    finalized = (await c.getBlock({ blockTag: "finalized" })).number != null;
  } catch {
    /* not supported */
  }
  const r = await getTransferLogsAdaptive(c as never, { token, fromBlock: latest - 49n, toBlock: latest });
  return { latest, finalized, span: r.coveredTo - (latest - 49n) + 1n };
}

async function checkBsc() {
  const token = getAddress(process.env.CHECK_BSC_TOKEN || SETTING_DEFAULTS.test_token_contract.BSC);
  console.log(`\n== BSC Testnet, token ${token}`);
  let chosen: string | null = null;
  for (const url of BSC_CANDIDATES) {
    try {
      resetLearnedSpanForTests();
      const p = await probeBsc(url, token);
      console.log(`  provider ${url}: OK (block ${p.latest}, finalized tag ${p.finalized ? "yes" : "no"}, accepts ${p.span}-block log queries)`);
      chosen ??= url;
    } catch (e) {
      console.log(`  provider ${url}: NO (${(e as Error).message.split("\n")[0].slice(0, 120)})`);
    }
  }
  record("bsc: a free testnet provider serves log queries", !!chosen, chosen ? `using ${chosen}` : "none of the candidates work");
  if (!chosen) return;
  resetLearnedSpanForTests();
  process.env.BSC_TEST_RPC_URL = chosen;
  delete process.env.BSC_TEST_RPC_BACKUP_URL;
  const ctx: NetworkContext = { ...baseCtx, tokenContract: token };
  const c = createPublicClient({ chain: bscTestnet, transport: http(chosen) });
  let fin: bigint;
  try {
    fin = (await c.getBlock({ blockTag: "finalized" })).number!;
    record("bsc: provider supports 'finalized'", true, `finalized block ${fin}`);
  } catch (e) {
    fin = (await c.getBlockNumber()) - 15n;
    record("bsc: provider supports 'finalized'", false, `falls back to latest-15 (${(e as Error).message.slice(0, 80)})`);
  }
  // Walk backwards in windows the provider accepts (the helper shrinks them).
  let logs: Awaited<ReturnType<typeof getTransferLogsAdaptive>>["logs"] = [];
  let to = fin;
  let width = 500n;
  let calls = 0;
  while (logs.length === 0 && fin - to < 20_000n && calls++ < 1000) {
    const from = to - width + 1n;
    const r = await getTransferLogsAdaptive(c as never, { token, fromBlock: from, toBlock: to });
    if (r.coveredTo < to) {
      width = r.coveredTo - from + 1n;
      continue;
    }
    logs = r.logs;
    to = from - 1n;
  }
  record("bsc: test token has recent transfers", logs.length > 0, `${logs.length} Transfer logs found searching back ${Number(fin - to)} blocks (window ${width} blocks)`);
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

/** The address the app reads the real BNB Smart Chain from (Live mode). */
const BSC_LIVE_DEFAULT = "https://bsc-rpc.publicnode.com";

async function checkBscLive() {
  const url = process.env.BSC_LIVE_RPC_URL || BSC_LIVE_DEFAULT;
  const token = getAddress(NETWORK_INFO.BSC.mainnetUsdt);
  // Don't print a keyed address in full: the key sits in the path.
  const shown = url.replace(/(\/\/[^/]+\/).+/, "$1…");
  console.log(`\n== BNB Smart Chain (real network), official USDT ${token}, via ${shown}`);
  resetLearnedSpanForTests();
  process.env.BSC_LIVE_RPC_URL = url;
  delete process.env.BSC_LIVE_RPC_BACKUP_URL;
  const ctx: NetworkContext = { ...baseCtx, mode: "LIVE", tokenContract: token };
  const c = createPublicClient({ chain: bsc, transport: http(url, { timeout: 20_000, retryCount: 1 }) });
  const latest = await c.getBlockNumber();
  record("bsc live: provider answers", latest > 0n, `latest block ${latest}`);
  let fin: bigint;
  try {
    fin = (await c.getBlock({ blockTag: "finalized" })).number!;
    record("bsc live: provider supports 'finalized'", true, `finalized block ${fin} (${latest - fin} behind)`);
  } catch (e) {
    fin = latest - 15n;
    record("bsc live: provider supports 'finalized'", false, `falls back to latest-15 (${(e as Error).message.slice(0, 80)})`);
  }
  // Real USDT moves every few seconds, so a few recent blocks are enough.
  const r = await getTransferLogsAdaptive(c as never, { token, fromBlock: fin - 4n, toBlock: fin });
  record("bsc live: provider serves USDT transfer searches", r.logs.length > 0, `${r.logs.length} transfers in blocks ${fin - 4n}–${r.coveredTo}`);
  if (!r.logs.length) return;
  const log = r.logs[r.logs.length - 1];
  try {
    const tx = await bscAdapter.lookupTx(log.transactionHash!, ctx);
    record("bsc live: lookup by TxID", tx.found && tx.success && tx.final, `tx ${log.transactionHash} found=${tx.found} success=${tx.success} final=${tx.final}`);
    const mine = tx.transfers.find((t) => t.position === Number(log.logIndex));
    record("bsc live: decoded amount matches chain (18 decimals)", !!mine && mine.rawAmount === BigInt(log.args.value!), mine ? `${mine.amount.toFixed()} USDT` : "log not decoded");
  } catch (e) {
    // The free PublicNode address refuses single-transaction lookups ("archive requests
    // require a personal token"). Customer TxIDs and Re-check need them; scanning doesn't.
    const why = (e as Error).message.split("\n").find((l) => l.startsWith("Details:")) ?? (e as Error).message.slice(0, 120);
    record("bsc live: lookup by TxID", false, `${why} (customer TxIDs and Re-check need a keyed BSC_LIVE_RPC_URL; payment detection doesn't)`);
  }
  // How payments are actually detected: scanning our deposit address. Checked either way.
  const to = getAddress(log.args.to!);
  const scan = await bscAdapter.scan([to], { lastBlock: (log.blockNumber! - 1n).toString() }, { ...ctx, scanRange: 3 });
  const hit = scan.transfers.find((t) => t.txid === log.transactionHash && t.position === Number(log.logIndex));
  record("bsc live: address scan finds the transfer", !!hit && hit.rawAmount === BigInt(log.args.value!), hit ? `found in block ${hit.blockNumber}, ${hit.amount.toFixed()} USDT` : `${scan.transfers.length} transfers returned, none matched`);
}

async function main() {
  console.log(`Decimals: Tron ${NETWORK_INFO.TRON.decimals}, BSC ${NETWORK_INFO.BSC.decimals}`);
  for (const [name, fn] of [["tron", checkTron], ["bsc", checkBsc], ["bsc live", checkBscLive]] as const) {
    try {
      await fn();
    } catch (e) {
      record(`${name}: unexpected error`, false, (e as Error).message);
    }
  }
  // Not fatal, but shown as warnings: a provider without the "finalized" tag (we fall
  // back), and a real-network address without single-transaction lookups (free
  // providers): payments are still detected by the address scan, which must pass.
  const warnOnly = (r: { check: string }) => r.check.includes("supports 'finalized'") || r.check === "bsc live: lookup by TxID";
  const failed = results.filter((r) => !r.ok && !warnOnly(r));
  for (const w of results.filter((r) => !r.ok && warnOnly(r))) console.log(`::warning::${w.check}: ${w.detail}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

main();
