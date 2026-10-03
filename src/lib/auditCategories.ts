// Audit log groups for the filter. Matched by the start of the action name, so new
// actions land in the right group without touching this list; anything unmatched is "Other".
export const AUDIT_CATEGORIES = [
  { id: "orders", label: "Orders & payments", prefixes: ["ORDER_", "TRANSFER_", "WALLET_CHECK_", "PAYMENT_", "IGNORED_WRONG_TOKEN", "DEV_SIMULATED", "CLOSED_MANUAL"] },
  { id: "customers", label: "Customers & KYC", prefixes: ["KYC_", "PAYOUT_METHOD_", "WALLET_ADDED", "WALLET_REMOVED", "WALLET_REQUIRED", "USER_", "EMAIL_", "MOBILE_", "PASSWORD_", "UNVERIFIED_PASSWORD"] },
  { id: "support", label: "Support chat", prefixes: ["SUPPORT_"] },
  { id: "settings", label: "Settings", prefixes: ["SETTING_", "BRAND_", "DEPOSIT_ADDRESS_", "RATE_JUMP_"] },
  { id: "admins", label: "Admins & sign-in", prefixes: ["ADMIN_", "BAD_LOGIN"] },
  { id: "system", label: "Alerts & reports", prefixes: ["WATCHER_", "RATE_FEED_", "RATE_LIMITED", "REPORT_"] },
] as const;

export type AuditCategoryId = (typeof AUDIT_CATEGORIES)[number]["id"] | "other";

export function auditCategory(action: string): AuditCategoryId {
  return AUDIT_CATEGORIES.find((c) => c.prefixes.some((p) => action.startsWith(p)))?.id ?? "other";
}
