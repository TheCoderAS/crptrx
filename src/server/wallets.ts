import { NETWORK_CODES, type NetworkCode } from "@/lib/networks";
import { audit, type Actor } from "./audit";
import { prisma } from "./db";
import { currentDepositAddresses } from "./deposit";
import { AppError } from "./errors";
import { getAdapter } from "./networks";
import { getSettings } from "./settings";

// Wallets a customer says they send USDT from. When the admin sets wallet
// registration to "Required", payments from any other wallet are held.
export const MAX_WALLETS_PER_NETWORK = 3;

export async function addWallet(userId: string, input: { network: string; address: string; label?: string }, actor: Actor) {
  const s = await getSettings();
  if (s.wallet_registration === "OFF") throw new AppError("Adding wallets is turned off.", 403);
  if (!NETWORK_CODES.includes(input.network as NetworkCode)) throw new AppError("Choose a network.");
  const network = input.network as NetworkCode;
  const adapter = getAdapter(network);
  const raw = String(input.address ?? "").trim();
  if (!adapter.isValidAddress(raw)) throw new AppError(network === "TRON" ? "Enter a valid Tron address (starts with T)." : "Enter a valid BNB Smart Chain address (starts with 0x).");
  const address = adapter.normalizeAddress(raw);
  if ((await currentDepositAddresses(network)).includes(address)) throw new AppError("That's our deposit address. Enter the wallet you send from.");
  const label = String(input.label ?? "").trim().slice(0, 40) || null;
  const mine = await prisma.userWallet.findMany({ where: { userId, network, deletedAt: null } });
  if (mine.some((w) => w.address === address)) throw new AppError("You've already added this wallet.");
  if (mine.length >= MAX_WALLETS_PER_NETWORK) throw new AppError(`You can add up to ${MAX_WALLETS_PER_NETWORK} wallets per network.`);
  // One wallet belongs to one customer.
  const taken = await prisma.userWallet.findFirst({ where: { network, address, deletedAt: null, userId: { not: userId } } });
  if (taken) throw new AppError("This wallet is already linked to another account. Contact support if it's yours.", 409);
  const w = await prisma.userWallet.create({ data: { userId, network, address, label } });
  await audit(actor, "WALLET_ADDED", { targetType: "user_wallet", targetId: w.id, details: { network, address } });
  return w;
}

export async function removeWallet(userId: string, id: string, actor: Actor) {
  const w = await prisma.userWallet.findFirst({ where: { id, userId, deletedAt: null } });
  if (!w) throw new AppError("Wallet not found", 404);
  await prisma.userWallet.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(actor, "WALLET_REMOVED", { targetType: "user_wallet", targetId: id, details: { network: w.network, address: w.address } });
}

export const listWallets = (userId: string) => prisma.userWallet.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "asc" } });
