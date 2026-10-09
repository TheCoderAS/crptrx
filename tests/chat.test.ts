import { beforeEach, describe, expect, it, vi } from "vitest";

// Firebase is replaced by recorders: these tests check what we'd send, not Google.
const fb = vi.hoisted(() => ({ signals: [] as unknown[][], sends: [] as unknown[], reply: null as null | ((tokens: string[]) => unknown) }));
vi.mock("@/server/firebase/chatSignal", () => ({ signalChat: (...a: unknown[]) => void fb.signals.push(a) }));
vi.mock("@/server/firebase/admin", () => ({ firebaseApp: () => ({}), logFirebaseError: () => undefined }));
vi.mock("firebase-admin/messaging", () => ({
  getMessaging: () => ({
    sendEachForMulticast: async (m: { tokens: string[] }) => {
      fb.sends.push(m);
      return fb.reply ? fb.reply(m.tokens) : { successCount: m.tokens.length, responses: m.tokens.map(() => ({ success: true })) };
    },
  }),
}));

import { prisma } from "@/server/db";
import { randomToken } from "@/server/crypto";
import { adminCounts } from "@/server/adminCounts";
import { listChat, markChatRead, sendChat, setChatResolved, unreadForUser, waitingOnUsCount } from "@/server/chat/service";
import { pushToUser, registerAdminPushDevice, registerPushDevice } from "@/server/firebase/push";
import { baseSettings, makeOrder, makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await baseSettings();
  fb.signals.length = 0;
  fb.sends.length = 0;
  fb.reply = null;
});

const settle = () => new Promise((r) => setTimeout(r, 50));

async function makeAdmin(name = "Priya Sharma") {
  return prisma.admin.create({ data: { name, email: `${randomToken().slice(0, 8)}@admin.dev`, passwordHash: "x", totpEnabled: true } });
}

describe("order chat", () => {
  it("only the order's owner (and admins) can use it", async () => {
    const { order, user } = await makeOrder("TRON", "100");
    const stranger = await makeUser();
    const admin = await makeAdmin();
    await sendChat(order.id, { type: "USER", userId: user.id }, "Where is my money?");
    await expect(listChat(order.id, { type: "USER", userId: stranger.user.id })).rejects.toMatchObject({ status: 404 });
    await expect(sendChat(order.id, { type: "USER", userId: stranger.user.id }, "hi")).rejects.toMatchObject({ status: 404 });
    const seen = await listChat(order.id, { type: "ADMIN", adminId: admin.id });
    expect(seen.messages.map((m) => m.text)).toEqual(["Where is my money?"]);
  });

  it("tracks whose turn it is, unread replies and resolve/reopen", async () => {
    const { order, user } = await makeOrder("TRON", "100");
    const admin = await makeAdmin();
    const U = { type: "USER" as const, userId: user.id };
    const A = { type: "ADMIN" as const, adminId: admin.id };

    await sendChat(order.id, U, "Paid 10 minutes ago");
    expect(await waitingOnUsCount()).toBe(1);
    expect((await adminCounts({ id: "super", role: "SUPER_ADMIN" })).support).toBe(1);
    expect(await unreadForUser(user.id)).toEqual([]);

    const reply = await sendChat(order.id, A, "Checking now");
    expect(reply.from).toBe("ADMIN");
    expect(await waitingOnUsCount()).toBe(0);
    expect(await unreadForUser(user.id)).toEqual([order.id]);
    // The customer sees the admin's first name only.
    expect((await listChat(order.id, U)).messages[1].name).toBe("Priya · Support");
    expect((await listChat(order.id, A)).messages[1].name).toBe("Priya Sharma");
    // An admin reply answers the customer's earlier messages.
    expect(await prisma.supportMessage.count({ where: { orderId: order.id, handled: false } })).toBe(0);

    await markChatRead(order.id, U);
    expect(await unreadForUser(user.id)).toEqual([]);

    await setChatResolved(order.id, admin.id, true);
    expect((await listChat(order.id, U)).status).toBe("RESOLVED");
    // A new customer message reopens it and puts it back on our list.
    await sendChat(order.id, U, "Still nothing");
    expect((await listChat(order.id, U)).status).toBe("OPEN");
    expect(await waitingOnUsCount()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: { in: ["SUPPORT_CHAT_REPLY", "SUPPORT_CHAT_RESOLVED"] } } })).toBe(2);
  });

  it("rejects empty and over-long messages", async () => {
    const { order, user } = await makeOrder("TRON", "100");
    const U = { type: "USER" as const, userId: user.id };
    await expect(sendChat(order.id, U, "   ")).rejects.toThrow();
    await expect(sendChat(order.id, U, "x".repeat(2001))).rejects.toThrow();
  });
});

describe("live signal and push", () => {
  it("rings the order's chat on every change, with no message text", async () => {
    const { order, user } = await makeOrder("TRON", "100");
    const admin = await makeAdmin();
    await sendChat(order.id, { type: "USER", userId: user.id }, "secret details");
    await markChatRead(order.id, { type: "ADMIN", adminId: admin.id });
    await setChatResolved(order.id, admin.id, true);
    expect(fb.signals).toEqual([
      [user.id, order.id, "message", "USER"],
      [user.id, order.id, "read", "ADMIN"],
      [user.id, order.id, "thread", "ADMIN"],
    ]);
  });

  it("pushes support replies to the customer's devices only, never the text", async () => {
    const { order, user } = await makeOrder("TRON", "100");
    const admin = await makeAdmin();
    await registerPushDevice(user.id, "web-token-aaaaaaaaaaaaaaaaaaaa", "WEB");
    await registerPushDevice(user.id, "android-token-bbbbbbbbbbbbbbbbbb", "ANDROID");
    await sendChat(order.id, { type: "USER", userId: user.id }, "hello");
    await settle();
    expect(fb.sends).toHaveLength(0); // customers' own messages don't push
    await sendChat(order.id, { type: "ADMIN", adminId: admin.id }, "Your UTR is 1234");
    await settle();
    expect(fb.sends).toHaveLength(1);
    const m = fb.sends[0] as { tokens: string[]; data: Record<string, string>; android: { notification: { body: string } } };
    expect(m.tokens.sort()).toEqual(["android-token-bbbbbbbbbbbbbbbbbb", "web-token-aaaaaaaaaaaaaaaaaaaa"]);
    expect(m.data).toMatchObject({ type: "chat_reply", orderId: order.id, link: `/orders/${order.id}`, tag: `chat-${order.id}` });
    expect(JSON.stringify(m)).not.toContain("1234");
  });

  it("customer messages push to their own admin's devices; support replies don't", async () => {
    const { order, user } = await makeOrder("TRON", "100");
    const admin = await makeAdmin();
    const other = await makeAdmin("Other Admin");
    await prisma.user.update({ where: { id: user.id }, data: { adminId: admin.id } });
    await registerAdminPushDevice(other.id, "other-admin-token-cccccccccccc", "WEB"); // not their customer: no alert
    const gone = await makeAdmin("Left Company");
    await prisma.admin.update({ where: { id: gone.id }, data: { status: "DISABLED" } });
    await registerAdminPushDevice(admin.id, "admin-browser-token-aaaaaaaaaaaa", "WEB");
    await registerAdminPushDevice(gone.id, "old-admin-token-bbbbbbbbbbbbbbbbb", "WEB");
    await sendChat(order.id, { type: "ADMIN", adminId: admin.id }, "Hello, how can we help?");
    await settle();
    expect(fb.sends).toHaveLength(0); // no customer devices, and admins aren't told about their own replies
    await sendChat(order.id, { type: "USER", userId: user.id }, "My payment details: 1234");
    await settle();
    expect(fb.sends).toHaveLength(1);
    const m = fb.sends[0] as { tokens: string[]; data: Record<string, string> };
    expect(m.tokens).toEqual(["admin-browser-token-aaaaaaaaaaaa"]);
    expect(m.data).toMatchObject({ type: "chat_customer", orderId: order.id, link: `/admin/orders/${order.id}` });
    expect(JSON.stringify(m)).not.toContain("1234");
  });

  it("forgets devices Firebase says are gone, and a token moves with whoever signs in", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await registerPushDevice(a.user.id, "shared-browser-token-xxxxxxxxxx", "WEB");
    await registerPushDevice(b.user.id, "shared-browser-token-xxxxxxxxxx", "WEB");
    expect(await prisma.pushDevice.count({ where: { userId: a.user.id } })).toBe(0);
    await registerPushDevice(b.user.id, "old-token-yyyyyyyyyyyyyyyyyyyy", "WEB");
    fb.reply = (tokens) => ({
      successCount: 1,
      responses: tokens.map((t) => (t.startsWith("old") ? { success: false, error: { code: "messaging/registration-token-not-registered" } } : { success: true })),
    });
    expect(await pushToUser(b.user.id, { title: "t", body: "b", link: "/", tag: "x" })).toEqual({ sent: 1, removed: 1 });
    expect((await prisma.pushDevice.findMany({ where: { userId: b.user.id } })).map((d) => d.token)).toEqual(["shared-browser-token-xxxxxxxxxx"]);
  });
});

describe("chat attachments", () => {
  it("accept JPG/PNG only, checked by the file's bytes", async () => {
    const { chatAttachment } = await import("@/server/chat/upload");
    const pdf = new File([Buffer.from("%PDF-1.4\n%fake")], "receipt.png", { type: "image/png" });
    const fdPdf = new FormData();
    fdPdf.set("file", pdf);
    await expect(chatAttachment(fdPdf, "u1")).rejects.toThrow(/JPG or PNG/);
    const empty = new FormData();
    expect(await chatAttachment(empty, "u1")).toBeNull();
  });
});
