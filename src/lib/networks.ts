// Client-safe network reference data (spec 8.1). No secrets here.
export type NetworkCode = "TRON" | "BSC";
export type Mode = "TEST" | "LIVE";

export const NETWORK_CODES: NetworkCode[] = ["TRON", "BSC"];

export const NETWORK_INFO: Record<
  NetworkCode,
  {
    name: string;
    hint: string;
    decimals: number;
    mainnetUsdt: string;
    feeCoin: string;
    badge: string; // Tailwind classes; each network has its own colour everywhere
    testnetName: string;
  }
> = {
  TRON: {
    name: "Tron (TRC-20)",
    hint: "Low fees. Common on many Indian exchanges and wallets.",
    decimals: 6,
    mainnetUsdt: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    feeCoin: "TRX",
    badge: "bg-red-100 text-red-800 ring-red-300",
    testnetName: "Tron Nile testnet",
  },
  BSC: {
    name: "BNB Smart Chain (BEP-20)",
    hint: "Most common for Binance users: BEP-20.",
    decimals: 18,
    mainnetUsdt: "0x55d398326f99059fF775485246999027B3197955",
    feeCoin: "BNB",
    badge: "bg-amber-100 text-amber-900 ring-amber-300",
    testnetName: "BSC Testnet (chain ID 97)",
  },
};

export function explorerTxUrl(network: NetworkCode, mode: Mode, txid: string): string {
  if (network === "TRON")
    return mode === "LIVE"
      ? `https://tronscan.org/#/transaction/${txid}`
      : `https://nile.tronscan.org/#/transaction/${txid}`;
  return mode === "LIVE" ? `https://bscscan.com/tx/${txid}` : `https://testnet.bscscan.com/tx/${txid}`;
}

export function explorerAddressUrl(network: NetworkCode, mode: Mode, address: string): string {
  if (network === "TRON")
    return mode === "LIVE" ? `https://tronscan.org/#/address/${address}` : `https://nile.tronscan.org/#/address/${address}`;
  return mode === "LIVE" ? `https://bscscan.com/address/${address}` : `https://testnet.bscscan.com/address/${address}`;
}

/** Guess which network a TxID belongs to from its format: BSC = 0x + 64 hex, Tron = 64 hex. */
export function txidNetwork(txid: string): NetworkCode | null {
  const t = txid.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(t)) return "BSC";
  if (/^[0-9a-fA-F]{64}$/.test(t)) return "TRON";
  return null;
}
