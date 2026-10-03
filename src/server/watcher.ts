import type { Prisma } from "@prisma/client";
import { NETWORK_INFO, type NetworkCode } from "@/lib/networks";
import { audit, SYSTEM } from "./audit";
import { prisma } from "./db";
import { applyDueAddressChanges, watchedAddresses } from "./deposit";
import { ingestTransfers, networkContext, verifySubmittedTxid, type MatchEvent } from "./matching";
import { getAdapter } from "./networks";
import { withRetry } from "./networks/http";
import { notifyMatchEvents, notifySuperAdmins } from "./notify";
import { getSettings } from "./settings";

export const ALERT_AFTER_MS = 10 * 60 * 1000;

/**
 * One watcher pass for one network: read new final transfers since the saved
 * cursor, store + match them, then save the cursor. The cursor is saved only
 * after the transfers are stored, so a crash re-reads (and dedupes) rather
 * than skipping.
 */
export async function watchOnce(network: NetworkCode): Promise<MatchEvent[]> {
  const s = await getSettings();
  const mode = s.network_mode;
  const adapter = getAdapter(network);
  const ctx = networkContext(s, network);
  if (!ctx.tokenContract) throw new Error(`No token contract set for ${network}`);
  const state = await prisma.watcherState.findUnique({ where: { network } });
  const stored = (state?.cursor ?? {}) as Record<string, unknown>;
  // Cursor is kept per mode so switching Test -> Live starts fresh.
  const cursor = stored[mode] ?? null;
  const addresses = await watchedAddresses(network, mode);
  const result = await withRetry(() => adapter.scan(addresses, cursor, ctx), 3, 1000);
  const events = await ingestTransfers(result.transfers);
  const next = { ...stored, [mode]: result.cursor } as Prisma.InputJsonValue;
  await prisma.watcherState.upsert({
    where: { network },
    create: { network, cursor: next, lastSuccessAt: new Date() },
    update: { cursor: next, lastSuccessAt: new Date(), failingSince: null, lastError: null, alertSentAt: null },
  });
  return events;
}

/** Records a failure; emails super admins once when a network has been failing > 10 minutes. */
export async function recordWatcherFailure(network: NetworkCode, err: unknown, now = new Date()) {
  const msg = err instanceof Error ? err.message : String(err);
  const st = await prisma.watcherState.upsert({
    where: { network },
    create: { network, cursor: {}, lastErrorAt: now, lastError: msg, failingSince: now },
    update: { lastErrorAt: now, lastError: msg },
  });
  const since = st.failingSince ?? now;
  if (!st.failingSince) await prisma.watcherState.update({ where: { network }, data: { failingSince: now } });
  if (!st.alertSentAt && now.getTime() - since.getTime() > ALERT_AFTER_MS) {
    await prisma.watcherState.update({ where: { network }, data: { alertSentAt: now } });
    await audit(SYSTEM, "WATCHER_ALERT", { targetType: "network", targetId: network, details: { error: msg } });
    await notifySuperAdmins(
      `Network check delayed: ${NETWORK_INFO[network].name}`,
      `Blockchain checks for ${NETWORK_INFO[network].name} have been failing since ${since.toISOString()}.\nLast error: ${msg}\n\nNo payments on this network are being confirmed until this recovers.`,
    );
  }
}

/** For the admin dashboard banner. */
export async function delayedNetworks(now = new Date()): Promise<NetworkCode[]> {
  const rows = await prisma.watcherState.findMany();
  return rows
    .filter((r) => r.failingSince && now.getTime() - r.failingSince.getTime() > ALERT_AFTER_MS)
    .map((r) => r.network as NetworkCode);
}

/**
 * Check TxIDs users submitted (per network, so one outage never blocks the other).
 * Each one on its own: a lookup the provider refuses (free providers refuse single-
 * transaction lookups) skips that order until next time; it doesn't stop the others
 * or mark the network as failing. The address scan still finds those payments.
 */
export async function verifySubmitted(network: NetworkCode): Promise<MatchEvent[]> {
  const pending = await prisma.order.findMany({ where: { status: "PAYMENT_SUBMITTED", network }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 50 });
  const out: MatchEvent[] = [];
  for (const o of pending) {
    try {
      out.push(...(await verifySubmittedTxid(o.id)));
    } catch (e) {
      console.warn(`[watch:${network}] TxID check for ${o.id} skipped: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  return out;
}

export async function networkTick(network: NetworkCode) {
  const s = await getSettings();
  // Open orders keep being watched even when new quotes on the network are paused.
  try {
    // Tell customers about scanned payments first; TxID checks can't hold them up.
    await notifyMatchEvents(await watchOnce(network));
  } catch (e) {
    await recordWatcherFailure(network, e);
    throw e;
  }
  await notifyMatchEvents(await verifySubmitted(network));
  return s.network_mode;
}

export { applyDueAddressChanges };
