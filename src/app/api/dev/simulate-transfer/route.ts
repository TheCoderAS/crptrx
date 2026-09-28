import { randomBytes } from "node:crypto";
import { api, body } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { ingestTransfers } from "@/server/matching";
import { D, toUnits } from "@/server/money";
import { notifyMatchEvents } from "@/server/notify";
import { getSettings, tokenContractFor } from "@/server/settings";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { tronHexToBase58 } from "@/server/networks/tronAddress";
import { getAddress } from "viem";

/**
 * TEST PHASES ONLY. Pretends a USDT transfer arrived so testers can walk the
 * whole flow without testnet tokens. Refused unless DEV_TOOLS_ENABLED=true AND
 * network mode is Test AND the caller is a super admin.
 */
export const POST = api(async (req: Request) => {
  const admin = await requireAdmin("SUPER_ADMIN");
  const s = await getSettings();
  if (!env.devToolsEnabled || s.network_mode !== "TEST") throw new AppError("Not available.", 404);
  const b = await body<{ network: NetworkCode; amount: string; to?: string; wrongToken?: boolean }>(req);
  const n = b.network;
  if (!NETWORK_INFO[n]) throw new AppError("Choose a network.");
  if (!/^\d+(\.\d{1,6})?$/.test(String(b.amount ?? ""))) throw new AppError("Enter an amount.");
  const rand = (bytes: number) => randomBytes(bytes).toString("hex");
  const addr = () => (n === "TRON" ? tronHexToBase58("41" + rand(20)) : getAddress("0x" + rand(20)));
  const txid = n === "TRON" ? rand(32) : "0x" + rand(32);
  const events = await ingestTransfers([
    {
      network: n,
      txid,
      position: 0,
      tokenContract: b.wrongToken ? addr() : tokenContractFor(s, n),
      from: addr(),
      to: b.to?.trim() || s.deposit_address.TEST[n],
      rawAmount: toUnits(b.amount, NETWORK_INFO[n].decimals),
      amount: D(b.amount),
      blockNumber: 0n,
      blockTime: new Date(),
      raw: { simulated: true, by: admin.id },
    },
  ]);
  await audit({ type: "ADMIN", id: admin.id }, "DEV_SIMULATED_TRANSFER", { details: { network: n, amount: b.amount, txid } });
  await notifyMatchEvents(events);
  return { message: `Simulated ${b.amount} USDT on ${NETWORK_INFO[n].name}. TxID ${txid}. Result: ${events.length ? events.map((e) => `${e.orderId} ${e.kind}`).join(", ") : "no order matched (see Unmatched payments)"}` };
});
