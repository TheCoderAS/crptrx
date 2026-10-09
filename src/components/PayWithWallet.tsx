"use client";
import { toastError } from "@/components/Toaster";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { Loader2, Wallet } from "lucide-react";
import { InfoTip } from "./InfoTip";

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
  TEST: { id: 97, chainId: "0x61", chainName: "BNB Smart Chain Testnet", rpcUrls: ["https://bsc-testnet-rpc.publicnode.com"], blockExplorerUrls: ["https://testnet.bscscan.com"], nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 } },
  LIVE: { id: 56, chainId: "0x38", chainName: "BNB Smart Chain", rpcUrls: ["https://bsc-dataseed.bnbchain.org"], blockExplorerUrls: ["https://bscscan.com"], nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 } },
};

// The wallet is set to our deposit address: the payment would go from us to us.
const OWN_WALLET = "Your wallet is set to our deposit address, so this would send money to itself. Switch to the account you're paying from, then try again.";
const WC_STUCK = "Couldn't reach the wallet service. Check your internet and try again, or send the payment yourself using the details below.";

/**
 * One-click payment. Uses the wallet in the browser (MetaMask, TronLink) when
 * there is one; otherwise, if WalletConnect is set up, lets the customer pick a
 * wallet app (on a phone) or scan a QR code (on a computer). Either way the
 * token, our address and the exact amount are filled in, and the transaction is
 * recorded on the order, so nobody copies a transaction ID.
 */
export function PayWithWallet(p: { orderId: string; network: "BSC" | "TRON"; mode: "TEST" | "LIVE"; token: string; to: string; amount: string; decimals: number; wcProjectId?: string | null; appName: string }) {
  const router = useRouter();
  const [injected, setInjected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Messages go to the top-right pop-ups (Toaster).
  const setError = (m: string | null) => void (m && toastError(m));

  useEffect(() => {
    // TronLink injects a moment after load.
    const check = () => {
      const w = window as Win;
      setInjected(p.network === "BSC" ? !!w.ethereum : !!(w.tronLink || w.tronWeb));
    };
    check();
    const t = setTimeout(check, 1200);
    return () => clearTimeout(t);
  }, [p.network]);

  if (!injected && !p.wcProjectId) return null;
  const walletName = injected ? (p.network === "BSC" ? "MetaMask" : "TronLink") : "your wallet app";
  const metadata = () => ({ name: p.appName, description: `Pay order ${p.orderId}`, url: window.location.origin, icons: [`${window.location.origin}/favicon.ico`] });

  async function pay() {
    setError(null);
    try {
      setBusy(`Opening ${walletName}…`);
      if (p.network === "BSC") {
        const txid = injected ? await payBsc((window as Win).ethereum!, true) : await payBscWalletConnect();
        await record(txid);
      } else if (injected) {
        await record(await payTron());
      } else {
        await payTronWalletConnect(); // the server records it
      }
      router.refresh();
    } catch (e) {
      const err = e as { code?: number; message?: string };
      setError(err.code === 4001 || /reject|denied|cancel|closed|reset/i.test(err.message ?? "") ? "Cancelled. Nothing was sent." : (err.message ?? "Couldn't open your wallet.").slice(0, 200));
    } finally {
      setBusy(null);
    }
  }

  async function record(txid: string) {
    setBusy("Recording your payment…");
    const res = await fetch(`/api/orders/${p.orderId}/txid`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txid }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      // The payment went through; the watcher still finds it by amount, so this isn't fatal.
      setError(`Payment sent, but we couldn't attach it to the order (${d.error ?? res.status}). We'll still detect it automatically.`);
    }
  }

  async function payBsc(eth: Eip1193, canSwitch: boolean): Promise<string> {
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    if (accounts[0]?.toLowerCase() === p.to.toLowerCase()) throw new Error(OWN_WALLET);
    const chain = BSC_CHAIN[p.mode];
    if (canSwitch && Number(await eth.request({ method: "eth_chainId" })) !== chain.id) {
      const params = { chainId: chain.chainId, chainName: chain.chainName, rpcUrls: chain.rpcUrls, blockExplorerUrls: chain.blockExplorerUrls, nativeCurrency: chain.nativeCurrency };
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainId }] });
      } catch (e) {
        if ((e as { code?: number }).code !== 4902) throw e;
        await eth.request({ method: "wallet_addEthereumChain", params: [params] });
      }
    }
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [p.to as `0x${string}`, parseUnits(p.amount, p.decimals)] });
    setBusy(`Confirm the payment in ${walletName}…`);
    return (await eth.request({ method: "eth_sendTransaction", params: [{ from: accounts[0], to: p.token, data }] })) as string;
  }

  /** WalletConnect for BSC: the code loads only now, on tap. */
  async function payBscWalletConnect(): Promise<string> {
    const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
    const chain = BSC_CHAIN[p.mode];
    const provider = await EthereumProvider.init({ projectId: p.wcProjectId!, chains: [chain.id], rpcMap: { [chain.id]: chain.rpcUrls[0] }, showQrModal: true, metadata: metadata() });
    // The wallet picker can only offer "Open" once WalletConnect's servers hand out a link. If they
    // never do (no connection, or this website isn't allowed in the WalletConnect project), stop
    // after 20 s with a clear message instead of a spinner that never ends.
    let gotLink = false;
    provider.on("display_uri", () => {
      gotLink = true;
    });
    const stuck = new Promise<never>((_, reject) =>
      setTimeout(() => {
        if (gotLink) return;
        (provider as unknown as { modal?: { closeModal?: () => void } }).modal?.closeModal?.();
        console.warn(`[wallet] WalletConnect gave no link within 20 s (website ${window.location.origin})`);
        reject(new Error(WC_STUCK));
      }, 20_000),
    );
    try {
      await Promise.race([provider.connect(), stuck]);
      // The wallet joined on the chain we asked for, so no network switch is needed.
      return await payBsc(provider as unknown as Eip1193, false);
    } finally {
      provider.disconnect().catch(() => undefined);
    }
  }

  async function payTron(): Promise<string> {
    const w = window as Win;
    await w.tronLink?.request({ method: "tron_requestAccounts" });
    const tw = w.tronWeb;
    const from = tw?.defaultAddress?.base58;
    if (!tw || !from) throw new Error("Unlock TronLink and try again.");
    if (from === p.to) throw new Error(OWN_WALLET);
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

  /** WalletConnect for Tron: the wallet only signs; our server builds and sends the transfer. */
  async function payTronWalletConnect() {
    const { WalletConnectWallet, WalletConnectChainID } = await import("@tronweb3/walletconnect-tron");
    const wallet = new WalletConnectWallet({
      network: p.mode === "LIVE" ? WalletConnectChainID.Mainnet : WalletConnectChainID.Nile,
      options: { projectId: p.wcProjectId!, metadata: metadata() },
      allWallets: "SHOW",
    });
    try {
      const { address } = await wallet.connect();
      const step = async (body: Record<string, unknown>) => {
        const res = await fetch(`/api/orders/${p.orderId}/tron-pay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? `Error ${res.status}`);
        return d;
      };
      const { transaction } = await step({ step: "build", from: address });
      setBusy("Confirm the payment in your wallet app…");
      const signed = await wallet.signTransaction(transaction);
      setBusy("Sending your payment…");
      await step({ step: "send", signed });
    } finally {
      wallet.disconnect().catch(() => undefined);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={pay} disabled={!!busy} className="btn btn-lg bg-brand-gradient flex-1 text-white shadow-lg shadow-brand-600/20 hover:opacity-95">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wallet className="size-4" aria-hidden />}
          {busy ?? (injected ? `Pay ${p.amount} USDT with ${walletName}` : `Pay ${p.amount} USDT with a wallet app`)}
        </button>
        <InfoTip>
          {injected
            ? "Opens your wallet with everything filled in. Or send it yourself using the details below."
            : `Pick your wallet app (${p.network === "BSC" ? "MetaMask, Trust Wallet…" : "TronLink, Trust Wallet…"}). On a computer, scan the QR code with your phone. Or send it yourself using the details below.`}
        </InfoTip>
      </div>
    </div>
  );
}
