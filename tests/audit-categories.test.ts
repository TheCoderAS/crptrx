import { describe, expect, it } from "vitest";
import { auditCategory } from "@/lib/auditCategories";

describe("audit log categories", () => {
  it("puts each kind of action in its group", () => {
    expect(auditCategory("SETTING_CHANGED")).toBe("settings");
    expect(auditCategory("DEPOSIT_ADDRESS_CHANGE_REQUESTED")).toBe("settings");
    expect(auditCategory("WALLET_CHECK_DEFAULTED")).toBe("orders");
    expect(auditCategory("WALLET_ADDED")).toBe("customers");
    expect(auditCategory("KYC_DOC_VIEWED")).toBe("customers");
    expect(auditCategory("SUPPORT_CHAT_REPLY")).toBe("support");
    expect(auditCategory("ADMIN_LOGIN_FAILED")).toBe("admins");
    expect(auditCategory("RATE_FEED_ALERT")).toBe("system");
    expect(auditCategory("SOMETHING_NEW")).toBe("other");
  });
});
