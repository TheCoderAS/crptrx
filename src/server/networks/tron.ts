import { NETWORK_INFO, explorerTxUrl } from "@/lib/networks";
import { env } from "../env";
import { fromUnits } from "../money";
import { isValidTronAddress, tronBase58ToHex, tronHexToBase58 } from "./tronAddress";
import type { ChainTransfer, NetworkAdapter, NetworkContext, TxLookup } from "./types";
import { fetchJson } from "./http";

const TRANSFER_TOPIC = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DECIMALS = NETWORK_INFO.TRON.decimals;

const baseUrl = (ctx: NetworkContext) => (ctx.mode === "LIVE" ? env.tron.liveApiUrl : env.tron.testApiUrl);
const headers = (): Record<string, string> => (env.tron.apiKey ? { "TRON-PRO-API-KEY": env.tron.apiKey } : {});

interface SolidityTxInfo {
  id?: string;
  blockNumber?: number;
  blockTimeStamp?: number;
  receipt?: { result?: string };
  result?: string; // "FAILED" on failure
  log?: { address: string; topics: string[]; data: string }[];
}

/** Decode Transfer logs out of a (solidified) transaction-info response. */
export function decodeTronTxInfo(txid: string, info: SolidityTxInfo): TxLookup {
  if (!info || !info.id) return { found: false, success: false, final: false, transfers: [] };
  const success = info.receipt?.result === "SUCCESS" && info.result !== "FAILED";
  const transfers: ChainTransfer[] = [];
  (info.log ?? []).forEach((log, position) => {
    const topics = log.topics.map((t) => t.replace(/^0x/, "").toLowerCase());
    if (topics[0] !== TRANSFER_TOPIC || topics.length < 3) return;
    const raw = BigInt("0x" + (log.data.replace(/^0x/, "") || "0"));
    transfers.push({
      network: "TRON",
      txid: txid.toLowerCase(),
      position,
      tokenContract: tronHexToBase58(log.address),
      from: tronHexToBase58(topics[1]),
      to: tronHexToBase58(topics[2]),
      rawAmount: raw,
      amount: fromUnits(raw, DECIMALS),
      blockNumber: BigInt(info.blockNumber ?? 0),
      blockTime: new Date(info.blockTimeStamp ?? 0),
      raw: log,
    });
  });
  // walletsolidity only returns solidified (final) transactions.
  return { found: true, success, final: true, transfers };
}

export const tronAdapter: NetworkAdapter = {
  code: "TRON",
  decimals: DECIMALS,
  isValidAddress: isValidTronAddress,
  canonicalAddress: (a) => a.trim(),
  normalizeAddress: (a) => a.trim(),
  isTxid: (t) => /^[0-9a-fA-F]{64}$/.test(t.trim()),
  normalizeTxid: (t) => t.trim().replace(/^0x/i, "").toLowerCase(),
  explorerTxUrl: (txid, mode) => explorerTxUrl("TRON", mode, txid),

  async lookupTx(txid, ctx) {
    const info = await fetchJson<SolidityTxInfo>(`${baseUrl(ctx)}/walletsolidity/gettransactioninfobyid`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers() },
      body: JSON.stringify({ value: txid }),
    });
    return decodeTronTxInfo(txid, info);
  },

  /**
   * For each watched address, list confirmed incoming TRC-20 transfers of the
   * official token since the address cursor, then re-read each transaction from
   * solidified data to get success, log position and block. Cursor is
   * { [address]: lastBlockTimestampMs } and only moves after a full pass.
   */
  async scan(addresses, cursor, ctx) {
    const cur = { ...((cursor as Record<string, number>) ?? {}) };
    const out: ChainTransfer[] = [];
    const tokenHex = tronBase58ToHex(ctx.tokenContract);
    for (const address of addresses) {
      const since = cur[address] ?? Date.now() - ctx.initialLookback * 1000;
      let maxTs = since;
      const txids = new Map<string, number>();
      let url: string | null =
        `${baseUrl(ctx)}/v1/accounts/${address}/transactions/trc20?only_confirmed=true&only_to=true&limit=200` +
        `&contract_address=${ctx.tokenContract}&min_timestamp=${since}&order_by=block_timestamp,asc`;
      let pages = 0;
      while (url && pages++ < 20) {
        const page: { data?: { transaction_id: string; block_timestamp: number }[]; meta?: { links?: { next?: string } } } =
          await fetchJson(url, { headers: headers() });
        for (const row of page.data ?? []) {
          txids.set(row.transaction_id.toLowerCase(), row.block_timestamp);
          if (row.block_timestamp > maxTs) maxTs = row.block_timestamp;
        }
        url = page.meta?.links?.next ?? null;
      }
      let notYetFinal: number | null = null;
      for (const [txid, ts] of txids) {
        const tx = await this.lookupTx(txid, ctx);
        if (!tx.found) {
          // Listed as confirmed but not yet in solidified data: keep the cursor at or before it.
          notYetFinal = notYetFinal === null ? ts : Math.min(notYetFinal, ts);
          continue;
        }
        if (!tx.success) continue;
        for (const t of tx.transfers)
          if (t.to === address && tronBase58ToHex(t.tokenContract) === tokenHex) out.push(t);
      }
      // min_timestamp is inclusive; re-read rows are dropped by the unique (network, txid, position) key.
      cur[address] = notYetFinal ?? maxTs;
    }
    return { transfers: out, cursor: cur };
  },
};
