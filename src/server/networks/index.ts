import type { NetworkCode } from "@/lib/networks";
import { bscAdapter } from "./bsc";
import { tronAdapter } from "./tron";
import type { NetworkAdapter } from "./types";

const adapters: Record<NetworkCode, NetworkAdapter> = { TRON: tronAdapter, BSC: bscAdapter };

/** Tests may swap in fake adapters; production code always goes through here. */
export function getAdapter(n: NetworkCode): NetworkAdapter {
  return adapters[n];
}
export function setAdapterForTests(n: NetworkCode, a: NetworkAdapter) {
  adapters[n] = a;
}
export type { NetworkAdapter, ChainTransfer, TxLookup, NetworkContext } from "./types";
