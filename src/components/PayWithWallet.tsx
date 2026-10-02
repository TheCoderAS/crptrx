"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { AlertCircle, Loader2, Wallet } from "lucide-react";

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
type TronWeb = {
  defaultAddress?: { base58?: string };
  fullNode?: { host?: string };
  transactionBuilder: {
    triggerSmartContract: (contract: string, fn: string, opts: Record<string, unknown>, params: { type: string; value: string }[], from: string) => Promise<{ transaction: Record<string, unknown> & { txID: string } }>;
  };
  trx: { sign: (tx: unknown) => Promise<unknown>; sendRawTransaction: (tx: unknown) => Promise<{ result?: boolean; txid?: string; code?: string }> };
};
type Win = Window & { ethereum?: Eip1193; tronLink?: Eip1193; tronWeb?: TronWeb };

const BSC_CHAIN = {
  TEST: { chainId: "0x61", chainName: "BNB Smart Chain Testnet", rpcUrls: ["https://bsc-testnet-rpc.publicnode.com"], blockExplorerUrls: ["https://testnet.bscscan.com"], nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 } },
  LIVE: { chainId: "0x38", chainName: "BNB Smart Chain", rpcUrls: ["https://bsc-dataseed.bnbchain.org"], blockExplorerUrls: ["https://bscscan.com"], nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 } },
};

/**
 * One-click payment from a browser wallet: opens MetaMask (BSC) or TronLink (Tron)
 * with the token, our address and the exact amount filled in, then records the
 * transaction on the order so nobody has to copy a transaction ID.
 * Shown only when such a wallet is installed; otherwise people copy the details.
 */
export function PayWithWallet(p: { orderId: string; network: "BSC" | "TRON"; mode: "TEST" | "LIVE"; token: string; to: string; amount: string; decimals: number }) {
  const router = useRouter();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // TronLink injects a moment after load.
    const check = () => {
      const w = window as Win;
      setAvailable(p.network === "BSC" ? !!w.ethereum : !!(w.tronLink || w.tronWeb));
    };
    check();
    const t = setTimeout(check, 1200);
    return () => clearTimeout(t);
  }, [p.network]);

  if (!available) return null;
  const walletName = p.network === "BSC" ? "MetaMask" : "TronLink";

  async function pay() {
    setError(null);
    try {
      setBusy(`Opening ${walletName}…`);
      const txid = p.network === "BSC" ? await payBsc() : await payTron();
      setBusy("Recording your payment…");
      const res = await fetch(`/api/orders/${p.orderId}/txid`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txid }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        // The payment went through; the watcher still finds it by amount, so this isn't fatal.
        setError(`Payment sent, but we couldn't attach it to the order (${d.error ?? res.status}). We'll still detect it automatically.`);
      }
      router.refresh();
    } catch (e) {
      const err = e as { code?: number; message?: string };
      setError(err.code === 4001 || /reject|denied|cancel/i.test(err.message ?? "") ? "Cancelled in your wallet. Nothing was sent." : (err.message ?? "Couldn't open your wallet.").slice(0, 200));
    } finally {
      setBusy(null);
    }
  }

  async function payBsc(): Promise<string> {
    const eth = (window as Win).ethereum!;
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    const chain = BSC_CHAIN[p.mode];
    if ((await eth.request({ method: "eth_chainId" })) !== chain.chainId) {
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainId }] });
      } catch (e) {
        if ((e as { code?: number }).code !== 4902) throw e;
        await eth.request({ method: "wallet_addEthereumChain", params: [chain] });
      }
    }
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [p.to as `0x${string}`, parseUnits(p.amount, p.decimals)] });
    setBusy("Confirm the payment in MetaMask…");
    return (await eth.request({ method: "eth_sendTransaction", params: [{ from: accounts[0], to: p.token, data }] })) as string;
  }

  async function payTron(): Promise<string> {
    const w = window as Win;
    await w.tronLink?.request({ method: "tron_requestAccounts" });
    const tw = w.tronWeb;
    const from = tw?.defaultAddress?.base58;
    if (!tw || !from) throw new Error("Unlock TronLink and try again.");
    const onTestnet = /nile|shasta/i.test(tw.fullNode?.host ?? "");
    if (p.mode === "TEST" && !onTestnet) throw new Error("Switch TronLink to the Nile testnet, then try again.");
    if (p.mode === "LIVE" && onTestnet) throw new Error("Switch TronLink to the Tron mainnet, then try again.");
    const raw = parseUnits(p.amount, p.decimals).toString();
    const { transaction } = await tw.transactionBuilder.triggerSmartContract(p.token, "transfer(address,uint256)", { feeLimit: 100_000_000 }, [{ type: "address", value: p.to }, { type: "uint256", value: raw }], from);
    setBusy("Confirm the payment in TronLink…");
    const signed = await tw.trx.sign(transaction);
    const r = await tw.trx.sendRawTransaction(signed);
    if (r.result === false) throw new Error(`TronLink couldn't send it (${r.code ?? "unknown error"}).`);
    return r.txid ?? transaction.txID;
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={pay} disabled={!!busy} className="btn btn-lg bg-brand-gradient w-full text-white shadow-lg shadow-brand-600/20 hover:opacity-95">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wallet className="size-4" aria-hidden />}
        {busy ?? `Pay ${p.amount} USDT with ${walletName}`}
      </button>
      {error && (
        <p role="alert" className="flex gap-2 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
      <p className="text-center text-xs text-slate-500">Opens your wallet with everything filled in. Or send it yourself using the details below.</p>
    </div>
  );
}
