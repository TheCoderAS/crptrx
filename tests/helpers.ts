import { randomBytes } from "node:crypto";
import { getAddress } from "viem";
import type { NetworkCode } from "@/lib/networks";
import { prisma } from "@/server/db";
import { D } from "@/server/money";
import { tronHexToBase58 } from "@/server/networks/tronAddress";
import type { ChainTransfer } from "@/server/networks/types";
import { writeSetting, SETTING_DEFAULTS } from "@/server/settings";
import { createQuote } from "@/server/orders/quote";
import { encrypt } from "@/server/crypto";

export const randTron = () => tronHexToBase58("41" + randomBytes(20).toString("hex"));
export const randBsc = () => getAddress("0x" + randomBytes(20).toString("hex"));
export const randTxid = (n: NetworkCode) => (n === "BSC" ? "0x" : "") + randomBytes(32).toString("hex");

export const ADDR = { TRON: randTron(), BSC: randBsc() };
export const TOKEN = { TRON: randTron(), BSC: randBsc() };
const SYS = { type: "SYSTEM" as const, id: null };

/** Wipe every table. History tables have append-only triggers, so switch user triggers off briefly. */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$transaction([
    ...["order_events", "settings_history", "audit_log"].map((t) => prisma.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`)),
    prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`),
    ...["order_events", "settings_history", "audit_log"].map((t) => prisma.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER USER`)),
  ]);
}

export async function baseSettings(over: Partial<Record<string, unknown>> = {}) {
  await writeSetting("rate", "90", SYS);
  await writeSetting("fee_percent", "1", SYS);
  await writeSetting("gst_enabled", true, SYS);
  await writeSetting("gst_percent", "18", SYS);
  await writeSetting("tax_percent", "1", SYS);
  await writeSetting("network_mode", "TEST", SYS);
  await writeSetting("deposit_address", { TEST: { TRON: ADDR.TRON, BSC: ADDR.BSC }, LIVE: { TRON: "", BSC: "" } }, SYS);
  await writeSetting("test_token_contract", { TRON: TOKEN.TRON, BSC: TOKEN.BSC }, SYS);
  await writeSetting("limit_user_daily_usdt", SETTING_DEFAULTS.limit_user_daily_usdt, SYS);
  for (const [k, v] of Object.entries(over)) await writeSetting(k as never, v, SYS);
}

let n = 0;
export async function makeUser(opts: { verified?: boolean } = {}) {
  n++;
  const user = await prisma.user.create({
    data: {
      email: `user${n}-${randomBytes(3).toString("hex")}@test.dev`,
      emailVerified: true,
      mobile: "+919000000000",
      mobileVerifiedAt: new Date(),
      kycStatus: opts.verified === false ? "NOT_STARTED" : "APPROVED",
    },
  });
  const pm = await prisma.payoutMethod.create({
    data: { userId: user.id, type: "BANK", holderName: "Test User", accountNumberEncrypted: encrypt("123456789012"), accountLast4: "9012", ifsc: "HDFC0001234", status: "APPROVED", isDefault: true },
  });
  return { user, pm, actor: { type: "USER" as const, id: user.id } };
}

export async function makeOrder(network: NetworkCode, amount = "100", now = new Date()) {
  const { user, pm, actor } = await makeUser();
  const order = await createQuote({ userId: user.id, network, amountType: "USDT", amount, payoutMethodId: pm.id }, actor, now);
  return { order, user, actor };
}

let pos = 0;
export function transfer(network: NetworkCode, amount: string, over: Partial<ChainTransfer> = {}): ChainTransfer {
  const decimals = network === "TRON" ? 6 : 18;
  const raw = BigInt(D(amount).mul(D(10).pow(decimals)).toFixed(0));
  return {
    network,
    txid: randTxid(network),
    position: pos++,
    tokenContract: TOKEN[network],
    from: network === "TRON" ? randTron() : randBsc(),
    to: ADDR[network],
    rawAmount: raw,
    amount: D(amount),
    blockNumber: 1000n,
    blockTime: new Date(Date.now() + 1000),
    raw: {},
    ...over,
  };
}

export const orderById = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
