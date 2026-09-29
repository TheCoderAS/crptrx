/**
 * Background worker: one loop per network watcher, plus the expiry job.
 * Each loop is independent, so a problem on one network never stops the other.
 * Run exactly one worker process.
 */
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { prisma } from "@/server/db";
import { applyDueAddressChanges } from "@/server/deposit";
import { notifyOrder } from "@/server/notify";
import { expireQuotes } from "@/server/orders/quote";
import { getSettings, tokenContractFor } from "@/server/settings";
import { networkTick } from "@/server/watcher";
import { refreshAutoRate } from "@/server/rateFeed";

const INTERVAL_MS: Record<NetworkCode, number> = { TRON: 45_000, BSC: 20_000 };
let stopping = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function loop(name: string, intervalMs: number, fn: () => Promise<void>) {
  let backoff = 0;
  while (!stopping) {
    try {
      await fn();
      backoff = 0;
    } catch (e) {
      backoff = Math.min(backoff ? backoff * 2 : intervalMs, 5 * 60_000);
      log(`[${name}] failed: ${(e as Error).message}. Next try in ${Math.round(backoff / 1000)}s`);
    }
    await sleep(backoff || intervalMs);
  }
}

async function watcher(n: NetworkCode) {
  const s = await getSettings();
  const hasAddress = !!s.deposit_address[s.network_mode][n];
  const hasToken = !!tokenContractFor(s, n);
  const hasOrders = await prisma.order.count({ where: { network: n, networkMode: s.network_mode } });
  if (!hasAddress || !hasToken) {
    if (hasOrders === 0) return; // nothing configured yet
  }
  await networkTick(n);
}

async function housekeeping() {
  await applyDueAddressChanges();
  const expired = await expireQuotes();
  for (const id of expired) await notifyOrder(id, "EXPIRED").catch(() => undefined);
  if (expired.length) log(`[expiry] expired ${expired.length} quote(s)`);
}

async function main() {
  log("worker starting");
  process.on("SIGTERM", () => (stopping = true));
  process.on("SIGINT", () => (stopping = true));
  await Promise.all([
    loop("expiry", 60_000, housekeeping),
    loop("rate", 120_000, async () => {
      const r = await refreshAutoRate();
      if ("ok" in r && !r.ok) log(`[rate] not updated: ${r.reason}`);
    }),
    ...(["TRON", "BSC"] as NetworkCode[]).map((n) => loop(`watch:${NETWORK_INFO[n].name}`, INTERVAL_MS[n], () => watcher(n))),
  ]);
  await prisma.$disconnect();
  log("worker stopped");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
