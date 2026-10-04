import { beforeEach, describe, expect, it, vi } from "vitest";

// Firebase is replaced by a recorder: these tests check what we'd send, not Google.
const fb = vi.hoisted(() => ({ sends: [] as { tokens: string[]; data: Record<string, string> }[] }));
vi.mock("@/server/firebase/admin", () => ({ firebaseApp: () => ({}), logFirebaseError: () => undefined, liveChatReady: () => false }));
vi.mock("firebase-admin/messaging", () => ({
  getMessaging: () => ({
    sendEachForMulticast: async (m: { tokens: string[]; data: Record<string, string> }) => {
      fb.sends.push(m);
      return { successCount: m.tokens.length, responses: m.tokens.map(() => ({ success: true })) };
    },
  }),
}));

import { prisma } from "@/server/db";
import { D } from "@/server/money";
import { notifyAllAdmins, notifyMatchEvents, notifyOrder, notifySuperAdmins } from "@/server/notify";
import { registerAdminPushDevice, registerPushDevice } from "@/server/firebase/push";
import { baseSettings, makeOrder, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await baseSettings();
  fb.sends.length = 0;
});

const settle = () => new Promise((r) => setTimeout(r, 50));
const admin = (role: "ADMIN" | "SUPER_ADMIN", name: string) =>
  prisma.admin.create({ data: { name, email: `${name}@admin.dev`, passwordHash: "x", role, totpEnabled: true } });

describe("push alongside email", () => {
  it("order updates reach the customer's devices, without amounts or bank details", async () => {
    const { order, user } = await makeOrder("TRON", "100");
    await registerPushDevice(user.id, "customer-phone-token-aaaaaaaaaaaa", "ANDROID");
    await notifyOrder(order.id, "PAID");
    await settle();
    expect(fb.sends).toHaveLength(1);
    const m = fb.sends[0];
    expect(m.tokens).toEqual(["customer-phone-token-aaaaaaaaaaaa"]);
    expect(m.data).toMatchObject({ type: "order_status", status: "PAID", orderId: order.id, title: "Payout sent", link: `/orders/${order.id}` });
    const text = JSON.stringify(m);
    expect(text).not.toContain(D(order.net).toFixed(2));
    expect(text).not.toContain("9012"); // account number ending
  });

  it("a confirmed payment tells the customer's admin and super admins, not other admins", async () => {
    const { order, user } = await makeOrder("TRON", "100");
    const a = await admin("ADMIN", "support");
    const other = await admin("ADMIN", "other");
    const sup = await admin("SUPER_ADMIN", "boss");
    await prisma.user.update({ where: { id: user.id }, data: { adminId: a.id } });
    await registerAdminPushDevice(a.id, "admin-laptop-token-bbbbbbbbbbbbb", "WEB");
    await registerAdminPushDevice(other.id, "other-laptop-token-eeeeeeeeeeeee", "WEB");
    await registerAdminPushDevice(sup.id, "boss-laptop-token-fffffffffffffff", "WEB");
    await notifyMatchEvents([{ kind: "CONFIRMED", orderId: order.id }]);
    await settle();
    const toAdmins = fb.sends.find((m) => m.tokens.includes("admin-laptop-token-bbbbbbbbbbbbb"));
    expect(toAdmins?.data).toMatchObject({ type: "order_waiting", orderId: order.id, link: `/admin/orders/${order.id}` });
    expect(toAdmins?.tokens).toContain("boss-laptop-token-fffffffffffffff");
    expect(fb.sends.some((m) => m.tokens.includes("other-laptop-token-eeeeeeeeeeeee"))).toBe(false);
  });

  it("super-admin alerts reach only super admins; all-admin alerts reach everyone", async () => {
    const sup = await admin("SUPER_ADMIN", "owner");
    const reg = await admin("ADMIN", "staff");
    await registerAdminPushDevice(sup.id, "owner-token-cccccccccccccccccccc", "WEB");
    await registerAdminPushDevice(reg.id, "staff-token-dddddddddddddddddddd", "WEB");
    await notifySuperAdmins("Live rate paused", "details with numbers 123", "/admin/settings");
    await settle();
    expect(fb.sends).toHaveLength(1);
    expect(fb.sends[0].tokens).toEqual(["owner-token-cccccccccccccccccccc"]);
    expect(fb.sends[0].data).toMatchObject({ title: "Live rate paused", link: "/admin/settings" });
    expect(JSON.stringify(fb.sends[0])).not.toContain("123");
    await notifyAllAdmins("SECURITY: Tron deposit address set", "Old: T... New: T...", "/admin/settings");
    await settle();
    expect(fb.sends[1].tokens.sort()).toEqual(["owner-token-cccccccccccccccccccc", "staff-token-dddddddddddddddddddd"]);
  });
});
