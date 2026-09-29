import type { Prisma } from "@prisma/client";
import { NETWORK_INFO, type Mode, type NetworkCode } from "@/lib/networks";
import { audit, type Actor } from "./audit";
import { prisma, type Tx } from "./db";
import { AppError } from "./errors";
import { D } from "./money";

/**
 * Every setting with its default. Values are JSON; money-like values are
 * strings so they stay exact. Suggested defaults marked OWNER must be confirmed
 * by the owner before launch (spec section 16).
 */
export const SETTING_DEFAULTS = {
  rate: "0", // INR per USDT. 0 = not set yet, quotes blocked.
  rate_max_age_hours: 12, // MANUAL mode: block quotes if the rate wasn't re-saved within this time
  // AUTO mode: rate = live market price x (1 - margin%), refreshed by the worker (rateFeed.ts).
  rate_mode: "MANUAL" as "MANUAL" | "AUTO",
  rate_margin_percent: "2", // OWNER
  rate_floor: "70", // OWNER: never offer less than this (INR per USDT)
  rate_ceiling: "120", // OWNER: never offer more than this
  rate_max_jump_percent: "3", // refuse a market move bigger than this between two updates
  rate_feed_max_age_minutes: 30, // block quotes if the feed hasn't succeeded for this long
  rate_min_sources: 2, // price sources that must agree
  rate_sources: ["coindcx", "wazirx", "coingecko"] as string[],
  fee_percent: "1", // OWNER
  gst_enabled: true, // OWNER
  gst_percent: "18", // OWNER
  tax_percent: "1", // OWNER + CA
  network_mode: "TEST" as Mode,
  network_enabled: { TRON: true, BSC: true } as Record<NetworkCode, boolean>,
  // Deposit addresses are changed only through the protected flow (deposit.ts).
  deposit_address: { TEST: { TRON: "", BSC: "" }, LIVE: { TRON: "", BSC: "" } } as Record<Mode, Record<NetworkCode, string>>,
  // Test tokens: the owner must confirm these. Live contracts are fixed in code.
  test_token_contract: {
    TRON: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
    BSC: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
  } as Record<NetworkCode, string>,
  limit_min_order_usdt: "10", // OWNER
  limit_max_order_usdt: "1000", // OWNER
  limit_user_daily_usdt: "2000", // OWNER
  limit_user_monthly_usdt: "20000", // OWNER
  limit_platform_daily_usdt: "50000", // OWNER
  business_hours_text: "Reviews happen 10 AM–7 PM, Mon–Sat",
  review_hours: 4,
  brand_name: "USDT Exchange", // OWNER: the app name shown to users
  // Sign-in and onboarding (admin-controlled; see onboarding.ts)
  auth_google_enabled: true,
  auth_email_enabled: true,
  auth_email_verification_required: true,
  onboarding_mobile_required: true,
  kyc_required: true, // can be switched off in TEST mode only
  kyc_auto_approve: false, // approve on submission; kept in a "review later" queue
  payout_auto_approve_on_name_match: false,
  wallet_registration: "OFF" as "OFF" | "OPTIONAL" | "REQUIRED",
  company_name: "[Company legal name]",
  company_address: "[Registered address]",
  company_fiu_reg: "[FIU registration number]",
  company_gstin: "[GSTIN]",
  support_email: "support@example.com",
  hold_reasons: [
    "Amount doesn't match the quote",
    "Payment sent on a different network than the order",
    "Payment arrived after the quote expired",
    "Transaction ID already used",
    "Over your limits",
    "Sender wallet needs extra checks",
    "Name or identity check needed",
    "Sent from a wallet that isn't on your account",
    "Other",
  ],
  bsc_finality_fallback_blocks: 15,
  bsc_scan_range: 500,
  bsc_initial_lookback_blocks: 200,
  tron_initial_lookback_seconds: 3600,
  admin_ip_allowlist: [] as string[],
  sms_notifications_enabled: false,
};

export type Settings = typeof SETTING_DEFAULTS;

/** Kept here (not imported from rateFeed.ts) to avoid a circular import. */
export const RATE_SOURCES_REF = { RATE_SOURCE_IDS: ["coindcx", "wazirx", "coingecko"] };
export type SettingKey = keyof Settings;

export async function getSettings(tx: Tx = prisma): Promise<Settings & { rateUpdatedAt: Date | null }> {
  const [rows, feed] = await Promise.all([tx.setting.findMany(), tx.rateFeedState.findUnique({ where: { id: 1 } })]);
  const out = structuredClone(SETTING_DEFAULTS) as Settings & { rateUpdatedAt: Date | null };
  out.rateUpdatedAt = null;
  for (const r of rows) {
    if (r.key in SETTING_DEFAULTS) (out as Record<string, unknown>)[r.key] = r.value;
    if (r.key === "rate") out.rateUpdatedAt = r.updatedAt;
  }
  // In Auto mode the rate is "fresh" when the live feed last succeeded, even if the value didn't change.
  if (out.rate_mode === "AUTO") out.rateUpdatedAt = feed?.lastOkAt ?? null;
  return out;
}

/** Keys an admin may edit through the generic settings screen (deposit address has its own flow). */
export const EDITABLE_KEYS: SettingKey[] = [
  "rate_mode",
  "rate",
  "rate_max_age_hours",
  "rate_margin_percent",
  "rate_floor",
  "rate_ceiling",
  "rate_max_jump_percent",
  "rate_feed_max_age_minutes",
  "rate_min_sources",
  "rate_sources",
  "fee_percent",
  "gst_enabled",
  "gst_percent",
  "tax_percent",
  "network_enabled",
  "test_token_contract",
  "limit_min_order_usdt",
  "limit_max_order_usdt",
  "limit_user_daily_usdt",
  "limit_user_monthly_usdt",
  "limit_platform_daily_usdt",
  "business_hours_text",
  "review_hours",
  "brand_name",
  "auth_google_enabled",
  "auth_email_enabled",
  "auth_email_verification_required",
  "onboarding_mobile_required",
  "kyc_required",
  "kyc_auto_approve",
  "payout_auto_approve_on_name_match",
  "wallet_registration",
  "company_name",
  "company_address",
  "company_fiu_reg",
  "company_gstin",
  "support_email",
  "hold_reasons",
  "bsc_finality_fallback_blocks",
  "bsc_scan_range",
  "bsc_initial_lookback_blocks",
  "tron_initial_lookback_seconds",
  "admin_ip_allowlist",
  "sms_notifications_enabled",
];

function validate(key: SettingKey, value: unknown, current: Settings): unknown {
  const decimalKeys: SettingKey[] = [
    "rate",
    "fee_percent",
    "gst_percent",
    "tax_percent",
    "rate_margin_percent",
    "rate_floor",
    "rate_ceiling",
    "rate_max_jump_percent",
    "limit_min_order_usdt",
    "limit_max_order_usdt",
    "limit_user_daily_usdt",
    "limit_user_monthly_usdt",
    "limit_platform_daily_usdt",
  ];
  if (decimalKeys.includes(key)) {
    const s = String(value).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) throw new AppError(`${key}: enter a plain number`);
    if (key.endsWith("percent") && D(s).gt(100)) throw new AppError(`${key}: must be 100 or less`);
    if (key === "rate" && D(s).lte(0)) throw new AppError("Rate must be above 0");
    return s;
  }
  const intKeys: SettingKey[] = [
    "rate_max_age_hours",
    "rate_feed_max_age_minutes",
    "rate_min_sources",
    "review_hours",
    "bsc_finality_fallback_blocks",
    "bsc_scan_range",
    "bsc_initial_lookback_blocks",
    "tron_initial_lookback_seconds",
  ];
  if (intKeys.includes(key)) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) throw new AppError(`${key}: enter a whole number of 1 or more`);
    if (key === "bsc_finality_fallback_blocks" && n < 15) throw new AppError("Wait at least 15 blocks");
    return n;
  }
  if (key === "rate_mode") {
    if (value !== "MANUAL" && value !== "AUTO") throw new AppError("Rate mode must be Manual or Auto.");
    return value;
  }
  if (key === "rate_sources") {
    const { RATE_SOURCE_IDS } = RATE_SOURCES_REF;
    const arr = (Array.isArray(value) ? value : String(value).split(/[\n,]/)).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    const bad = arr.filter((x) => !RATE_SOURCE_IDS.includes(x));
    if (bad.length) throw new AppError(`Unknown price source: ${bad.join(", ")}. Use: ${RATE_SOURCE_IDS.join(", ")}`);
    if (arr.length === 0) throw new AppError("Choose at least one price source.");
    return [...new Set(arr)];
  }
  const boolKeys: SettingKey[] = [
    "gst_enabled",
    "sms_notifications_enabled",
    "auth_google_enabled",
    "auth_email_enabled",
    "auth_email_verification_required",
    "onboarding_mobile_required",
    "kyc_required",
    "kyc_auto_approve",
    "payout_auto_approve_on_name_match",
  ];
  if (boolKeys.includes(key)) return value === true || value === "true";
  if (key === "wallet_registration") {
    if (!["OFF", "OPTIONAL", "REQUIRED"].includes(String(value))) throw new AppError("Wallet registration must be Off, Optional or Required.");
    return String(value);
  }
  if (key === "network_enabled") {
    const v = value as Record<string, unknown>;
    return { TRON: v.TRON === true || v.TRON === "true", BSC: v.BSC === true || v.BSC === "true" };
  }
  if (key === "test_token_contract") {
    if (current.network_mode !== "TEST") throw new AppError("Token contracts can only be edited in Test mode");
    const v = value as Record<string, string>;
    // Imported lazily to keep this module free of chain libraries for the client bundle.
    return { TRON: String(v.TRON ?? "").trim(), BSC: String(v.BSC ?? "").trim() };
  }
  if (key === "hold_reasons" || key === "admin_ip_allowlist") {
    const arr = Array.isArray(value) ? value : String(value).split("\n");
    return arr.map((s) => String(s).trim()).filter(Boolean);
  }
  return String(value ?? "").trim();
}

export async function updateSetting(key: SettingKey, value: unknown, actor: Actor, ip?: string | null) {
  if (!EDITABLE_KEYS.includes(key)) throw new AppError(`Setting ${key} cannot be changed here`);
  const current = await getSettings();
  let clean = validate(key, value, current);
  if (key === "test_token_contract") {
    const { getAdapter } = await import("./networks");
    const v = clean as Record<NetworkCode, string>;
    for (const n of ["TRON", "BSC"] as NetworkCode[]) {
      const a = getAdapter(n);
      if (!a.isValidAddress(v[n])) throw new AppError(`${NETWORK_INFO[n].name}: not a valid contract address for this network`);
      if (a.normalizeAddress(v[n]) === a.normalizeAddress(NETWORK_INFO[n].mainnetUsdt))
        throw new AppError("Never use a mainnet contract in Test mode");
      v[n] = a.canonicalAddress(v[n]);
    }
    clean = v;
  }
  if (key === "rate" && current.rate_mode === "AUTO") {
    if (D(String(clean)).eq(D(current.rate))) return; // unchanged field from the form
    throw new AppError("The rate is set automatically in Auto mode. Switch to Manual to type a rate.");
  }
  if (key === "rate_floor" || key === "rate_ceiling") {
    const floor = D(key === "rate_floor" ? String(clean) : current.rate_floor);
    const ceiling = D(key === "rate_ceiling" ? String(clean) : current.rate_ceiling);
    if (floor.gte(ceiling)) throw new AppError("The rate floor must be below the ceiling.");
  }
  if (key === "rate_margin_percent" && D(String(clean)).gte(50)) throw new AppError("Margin must be below 50%.");
  if (key === "auth_google_enabled" && clean === false && !current.auth_email_enabled)
    throw new AppError("Keep at least one sign-in method on (Google or email/password).");
  if (key === "auth_email_enabled" && clean === false && !current.auth_google_enabled)
    throw new AppError("Keep at least one sign-in method on (Google or email/password).");
  if (key === "auth_email_enabled" && clean === false && !(await import("./env")).env.firebase.webConfig)
    throw new AppError("Google sign-in isn't set up on the server yet (Firebase settings missing), so email sign-in must stay on.");
  if (key === "kyc_required" && clean === false && current.network_mode === "LIVE")
    throw new AppError("KYC can't be switched off in Live mode: without PAN there is no TDS reporting and no AML check. Use Test mode.");
  // Skip no-op saves so the history stays readable. Re-saving the rate is kept:
  // it confirms the rate is still current and resets its age.
  if (key !== "rate" && JSON.stringify(current[key]) === JSON.stringify(clean)) return;
  await writeSetting(key, clean, actor, ip);
}

/** Low-level write with history + audit. Callers must have validated `value`. */
export async function writeSetting(key: SettingKey, value: unknown, actor: Actor, ip?: string | null, tx?: Tx) {
  const run = async (t: Tx) => {
    const old = await t.setting.findUnique({ where: { key } });
    const json = value as Prisma.InputJsonValue;
    await t.setting.upsert({ where: { key }, create: { key, value: json, updatedBy: actor.id }, update: { value: json, updatedBy: actor.id } });
    await t.settingsHistory.create({
      data: { key, oldValue: (old?.value ?? undefined) as Prisma.InputJsonValue | undefined, newValue: json, changedBy: actor.id },
    });
    await audit(actor, "SETTING_CHANGED", { targetType: "setting", targetId: key, details: { old: old?.value ?? null, new: json } as Prisma.InputJsonValue, ip }, t);
  };
  if (tx) return run(tx);
  return prisma.$transaction(run);
}

/** False for empty values and the "[placeholder]" defaults, so unset details are never shown as claims. */
export const isRealValue = (v: string | null | undefined) => !!v && !/^\s*\[.*\]\s*$/.test(v);

export const LIVE_CONFIRM_PHRASE = "SWITCH TO LIVE";

export async function setNetworkMode(mode: Mode, typedConfirmation: string, actor: Actor, ip?: string | null) {
  if (mode === "LIVE" && !(await getSettings()).kyc_required)
    throw new AppError("Turn KYC back on before switching to Live.");
  if (mode === "LIVE" && typedConfirmation !== LIVE_CONFIRM_PHRASE)
    throw new AppError(`Type ${LIVE_CONFIRM_PHRASE} exactly to switch to Live`);
  if (mode !== "LIVE" && mode !== "TEST") throw new AppError("Unknown mode");
  await writeSetting("network_mode", mode, actor, ip);
}

/** The official token contract for a network in the current mode (spec 8.1). */
export function tokenContractFor(s: Settings, n: NetworkCode, mode: Mode = s.network_mode): string {
  return mode === "LIVE" ? NETWORK_INFO[n].mainnetUsdt : s.test_token_contract[n];
}

export function rateIsStale(s: Settings & { rateUpdatedAt: Date | null }, now = new Date()): boolean {
  if (!s.rateUpdatedAt || D(s.rate).lte(0)) return true;
  const maxAgeMs = s.rate_mode === "AUTO" ? s.rate_feed_max_age_minutes * 60_000 : s.rate_max_age_hours * 3600_000;
  return now.getTime() - s.rateUpdatedAt.getTime() > maxAgeMs;
}
