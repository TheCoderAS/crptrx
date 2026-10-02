import type { DepositAddressChange } from "@prisma/client";
import { NETWORK_INFO, type Mode, type NetworkCode } from "@/lib/networks";
import { audit, SYSTEM, type Actor } from "./audit";
import { randomToken, sha256 } from "./crypto";
import { prisma } from "./db";
import { AppError } from "./errors";
import { getAdapter } from "./networks";
import { getSettings, writeSetting } from "./settings";


/**
 * How long a new deposit address waits before it applies: the admin setting
 * address_change_delay_minutes (0 = instant). The wait lets other admins cancel
 * a change made from a stolen admin login before payments go to the new address.
 * Setting the first address always applies at once: there is nothing to divert.
 */
export function addressChangeDelayMs(delayMinutes: number, oldAddress: string | null): number {
  return oldAddress ? Math.max(0, delayMinutes) * 60_000 : 0;
}
export const ADDRESS_BANNER_MS = 24 * 60 * 60 * 1000;

/** Apply any address change whose wait has passed and wasn't cancelled. */
export async function applyDueAddressChanges(now = new Date()) {
  const due = await prisma.depositAddressChange.findMany({
    where: { appliedAt: null, cancelledAt: null, effectiveAt: { lte: now } },
    orderBy: { effectiveAt: "asc" },
  });
  for (const c of due) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.depositAddressChange.updateMany({
        where: { id: c.id, appliedAt: null, cancelledAt: null },
        data: { appliedAt: now },
      });
      if (claimed.count !== 1) return;
      const s = await getSettings(tx);
      const next = structuredClone(s.deposit_address);
      next[c.networkMode as Mode][c.network as NetworkCode] = c.newAddress;
      await writeSetting("deposit_address", next, { type: "SYSTEM", id: null }, null, tx);
      await audit(SYSTEM, "DEPOSIT_ADDRESS_APPLIED", { targetType: "deposit_address_change", targetId: c.id, details: { network: c.network, mode: c.networkMode, address: c.newAddress } }, tx);
    });
  }
  return due.length;
}

export async function getActiveDepositAddress(network: NetworkCode, mode?: Mode): Promise<string> {
  await applyDueAddressChanges();
  const s = await getSettings();
  return s.deposit_address[mode ?? s.network_mode][network];
}

/**
 * Request a deposit address change. The caller must already have re-checked
 * the super admin's 2FA code. Returns the cancel token for the email link.
 */
export async function requestAddressChange(network: NetworkCode, newAddressInput: string, actor: Actor, ip?: string | null) {
  const adapter = getAdapter(network);
  const input = newAddressInput.trim();
  if (!adapter.isValidAddress(input)) {
    const other = (network === "TRON" ? "BSC" : "TRON") as NetworkCode;
    const hint = getAdapter(other).isValidAddress(input) ? ` This looks like a ${NETWORK_INFO[other].name} address.` : "";
    throw new AppError(`Not a valid ${NETWORK_INFO[network].name} address.${hint}`);
  }
  const newAddress = adapter.canonicalAddress(input);
  const s = await getSettings();
  const mode = s.network_mode;
  const oldAddress = s.deposit_address[mode][network] || null;
  if (oldAddress && adapter.normalizeAddress(oldAddress) === adapter.normalizeAddress(newAddress))
    throw new AppError("That is already the active address.");
  const token = randomToken();
  const change = await prisma.$transaction(async (tx) => {
    // A newer request replaces any pending one for the same network and mode.
    await tx.depositAddressChange.updateMany({
      where: { network, networkMode: mode, appliedAt: null, cancelledAt: null },
      data: { cancelledAt: new Date(), cancelledBy: actor.id },
    });
    const c = await tx.depositAddressChange.create({
      data: {
        network,
        networkMode: mode,
        newAddress,
        oldAddress,
        requestedBy: actor.id!,
        cancelTokenHash: sha256(token),
        effectiveAt: new Date(Date.now() + addressChangeDelayMs(s.address_change_delay_minutes, oldAddress)),
      },
    });
    await audit(actor, "DEPOSIT_ADDRESS_CHANGE_REQUESTED", { targetType: "deposit_address_change", targetId: c.id, details: { network, mode, oldAddress, newAddress }, ip }, tx);
    return c;
  });
  if (change.effectiveAt.getTime() <= Date.now()) await applyDueAddressChanges(); // no wait: apply now
  return { change, token, immediate: change.effectiveAt.getTime() <= Date.now() };
}

export async function cancelAddressChange(opts: { token?: string; id?: string }, actor: Actor, ip?: string | null): Promise<DepositAddressChange> {
  const c = opts.token
    ? await prisma.depositAddressChange.findUnique({ where: { cancelTokenHash: sha256(opts.token) } })
    : await prisma.depositAddressChange.findUnique({ where: { id: opts.id } });
  if (!c) throw new AppError("Change request not found", 404);
  if (c.appliedAt) throw new AppError("This change already took effect. Set the correct address again.");
  if (c.cancelledAt) return c;
  const res = await prisma.depositAddressChange.update({ where: { id: c.id }, data: { cancelledAt: new Date(), cancelledBy: actor.id } });
  await audit(actor, "DEPOSIT_ADDRESS_CHANGE_CANCELLED", { targetType: "deposit_address_change", targetId: c.id, details: { network: c.network, newAddress: c.newAddress }, ip });
  return res;
}

/** For the dashboard banner: any change requested or applied in the last 24 hours. */
export async function recentAddressChanges(now = new Date()) {
  return prisma.depositAddressChange.findMany({
    where: { createdAt: { gte: new Date(now.getTime() - ADDRESS_BANNER_MS) } },
    orderBy: { createdAt: "desc" },
  });
}

/** Every deposit address that still has orders to watch (old addresses included). */
export async function watchedAddresses(network: NetworkCode, mode: Mode): Promise<string[]> {
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  const rows = await prisma.order.findMany({
    where: {
      network,
      networkMode: mode,
      OR: [
        { status: { in: ["QUOTE_READY", "PAYMENT_SUBMITTED"] } },
        { status: "EXPIRED", quoteExpiresAt: { gte: cutoff } }, // late payments, spec 8.4
      ],
    },
    select: { depositAddress: true },
    distinct: ["depositAddress"],
  });
  const set = new Set(rows.map((r) => r.depositAddress));
  const active = (await getSettings()).deposit_address[mode][network];
  if (active) set.add(active); // always watch the live address so strays show up as unmatched
  return [...set];
}

/** Every address that has ever been a deposit address for this network (for TxID lookups). */
export async function allKnownDepositAddresses(network: NetworkCode): Promise<string[]> {
  const a = getAdapter(network);
  const [changes, s, orders] = await Promise.all([
    prisma.depositAddressChange.findMany({ where: { network }, select: { newAddress: true, oldAddress: true } }),
    getSettings(),
    prisma.order.findMany({ where: { network }, select: { depositAddress: true }, distinct: ["depositAddress"] }),
  ]);
  const set = new Set<string>();
  for (const c of changes) {
    set.add(a.normalizeAddress(c.newAddress));
    if (c.oldAddress) set.add(a.normalizeAddress(c.oldAddress));
  }
  for (const m of ["TEST", "LIVE"] as Mode[]) if (s.deposit_address[m][network]) set.add(a.normalizeAddress(s.deposit_address[m][network]));
  for (const o of orders) set.add(a.normalizeAddress(o.depositAddress));
  return [...set];
}
