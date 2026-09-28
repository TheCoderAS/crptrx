import type { Decimal } from "../money";
import type { NetworkCode, Mode } from "@/lib/networks";

/** One token Transfer event found on chain, already decoded. */
export interface ChainTransfer {
  network: NetworkCode;
  txid: string; // canonical form (BSC lowercase 0x..., Tron lowercase hex)
  position: number; // log index; with network + txid forms the unique key
  tokenContract: string; // canonical address form
  from: string;
  to: string;
  rawAmount: bigint;
  amount: Decimal; // converted with THIS network's decimals
  blockNumber: bigint;
  blockTime: Date;
  raw: unknown;
}

export interface TxLookup {
  found: boolean;
  success: boolean; // Tron receipt SUCCESS / BSC status 1
  final: boolean; // solidified / finalized
  transfers: ChainTransfer[]; // every Transfer log in the tx, any token
}

export interface ScanResult {
  transfers: ChainTransfer[]; // only successful + final transfers of the official token
  cursor: unknown; // persisted in watcher_state after the transfers are saved
}

export interface NetworkContext {
  mode: Mode;
  tokenContract: string;
  finalityFallbackBlocks: number;
  scanRange: number;
  initialLookback: number;
}

/**
 * The single shared "network" interface (spec 0.8). Order logic only talks to
 * this; Tron and BNB Smart Chain are two implementations.
 */
export interface NetworkAdapter {
  code: NetworkCode;
  decimals: number;
  isValidAddress(address: string): boolean;
  /** Form used for storage and display (Tron base58, BSC EIP-55 checksum). */
  canonicalAddress(address: string): string;
  /** Form used for comparisons (BSC lowercase). */
  normalizeAddress(address: string): string;
  isTxid(txid: string): boolean;
  normalizeTxid(txid: string): string;
  explorerTxUrl(txid: string, mode: Mode): string;
  lookupTx(txid: string, ctx: NetworkContext): Promise<TxLookup>;
  scan(addresses: string[], cursor: unknown, ctx: NetworkContext): Promise<ScanResult>;
}
