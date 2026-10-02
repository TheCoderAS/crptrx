import type { Order } from "@prisma/client";
import { NETWORK_INFO } from "@/lib/networks";
import { env } from "./env";
import { AppError } from "./errors";
import { toUnits } from "./money";
import { fetchJson } from "./networks/http";
import { isValidTronAddress, tronBase58ToHex } from "./networks/tronAddress";

// Tron payments from a WalletConnect wallet app: the wallet only signs, so we build
// the transfer here (with our TronGrid key) and send the signed one to the network.

const base = (o: Pick<Order, "networkMode">) => (o.networkMode === "LIVE" ? env.tron.liveApiUrl : env.tron.testApiUrl);
const headers = (): Record<string, string> => ({ "content-type": "application/json", ...(env.tron.apiKey ? { "TRON-PRO-API-KEY": env.tron.apiKey } : {}) });

/** ABI data for transfer(to, amount): the selector plus both arguments, 32 bytes each. */
export function tronTransferData(to: string, rawAmount: bigint): string {
  return "a9059cbb" + tronBase58ToHex(to).slice(2).padStart(64, "0") + rawAmount.toString(16).padStart(64, "0");
}

const orderData = (o: Pick<Order, "depositAddress" | "usdtAmount">) => tronTransferData(o.depositAddress, toUnits(o.usdtAmount.toString(), NETWORK_INFO.TRON.decimals));

function checkPayer(o: Pick<Order, "depositAddress">, from: string) {
  if (!isValidTronAddress(from)) throw new AppError("That isn't a Tron wallet address.");
  if (from === o.depositAddress) throw new AppError("Your wallet is set to our deposit address, so this would send money to itself. Switch to the account you're paying from.");
}

/** An unsigned transfer of exactly the order amount, from the customer's wallet to our deposit address. */
export async function buildTronTransfer(o: Order, token: string, from: string): Promise<Record<string, unknown>> {
  checkPayer(o, from);
  const res = await fetchJson<{ result?: { result?: boolean; message?: string }; transaction?: Record<string, unknown> }>(`${base(o)}/wallet/triggersmartcontract`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      owner_address: from,
      contract_address: token,
      function_selector: "transfer(address,uint256)",
      parameter: orderData(o).slice(8),
      fee_limit: 100_000_000,
      call_value: 0,
      visible: true,
    }),
  });
  if (!res.result?.result || !res.transaction) throw new AppError("Couldn't prepare the Tron payment. Please try again.");
  return res.transaction;
}

interface SignedTronTx {
  txID?: string;
  signature?: string[];
  raw_data?: { contract?: { parameter?: { value?: { owner_address?: string; contract_address?: string; data?: string } } }[] };
}

/**
 * Send a signed transfer, but only if it is exactly this order's payment: same
 * token, our deposit address, the order amount. Returns the transaction ID.
 */
export async function broadcastTronTransfer(o: Order, token: string, signed: SignedTronTx): Promise<string> {
  const contracts = signed?.raw_data?.contract ?? [];
  const v = contracts[0]?.parameter?.value;
  if (contracts.length !== 1 || !v || !signed.txID || !signed.signature?.length) throw new AppError("That isn't a signed payment.");
  if (v.contract_address !== token || (v.data ?? "").toLowerCase() !== orderData(o)) throw new AppError("That payment doesn't match this order.");
  checkPayer(o, v.owner_address ?? "");
  const res = await fetchJson<{ result?: boolean; txid?: string; code?: string; message?: string }>(`${base(o)}/wallet/broadcasttransaction`, { method: "POST", headers: headers(), body: JSON.stringify(signed) });
  if (!res.result) {
    const why = res.message && /^[0-9a-f]+$/i.test(res.message) ? Buffer.from(res.message, "hex").toString("utf8") : res.message;
    throw new AppError(`The Tron network didn't accept the payment (${res.code ?? why ?? "unknown error"}).`);
  }
  return res.txid ?? signed.txID;
}
