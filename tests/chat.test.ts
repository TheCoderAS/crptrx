import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { prisma } from "@/server/db";
import { randomToken, sha256 } from "@/server/crypto";
import { adminCounts } from "@/server/adminCounts";
import { listChat, markChatRead, sendChat, setChatResolved, unreadForUser, waitingOnUsCount } from "@/server/chat/service";
import { attachChat } from "@/server/chat/ws";
import { baseSettings, makeOrder, makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await baseSettings();
});

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
    expect((await adminCounts()).support).toBe(1);
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

describe("chat socket", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = createServer((_, res) => res.end());
    attachChat(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  async function session(subjectType: "USER" | "ADMIN", subjectId: string) {
    const token = randomToken();
    await prisma.session.create({ data: { id: sha256(token), subjectType, subjectId, expiresAt: new Date(Date.now() + 3600_000) } });
    return `${subjectType === "USER" ? "sid" : "asid"}=${token}`;
  }

  function connect(query: string, cookie: string, origin = `http://${base}`) {
    const ws = new WebSocket(`ws://${base}/ws?${query}`, { headers: { cookie, origin } });
    const events: Record<string, unknown>[] = [];
    ws.on("message", (d) => events.push(JSON.parse(String(d))));
    const opened = new Promise<number>((resolve) => {
      ws.on("open", () => resolve(101));
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.on("error", () => resolve(0));
    });
    return { ws, events, opened };
  }

  const until = async (fn: () => boolean) => {
    for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 20));
    expect(fn()).toBe(true);
  };

  it("delivers messages and typing live, and keeps strangers out", async () => {
    const { order, user } = await makeOrder("TRON", "100");
    const stranger = await makeUser();
    const admin = await makeAdmin();
    const customer = connect(`order=${order.id}`, await session("USER", user.id));
    const support = connect(`order=${order.id}&as=admin`, await session("ADMIN", admin.id));
    const inbox = connect("inbox=1", await session("ADMIN", admin.id));
    expect(await customer.opened).toBe(101);
    expect(await support.opened).toBe(101);
    expect(await inbox.opened).toBe(101);

    // Someone else's order, no cookie, a customer asking for the inbox, another website.
    expect(await connect(`order=${order.id}`, await session("USER", stranger.user.id)).opened).toBe(404);
    expect(await connect(`order=${order.id}`, "").opened).toBe(401);
    expect(await connect("inbox=1", await session("USER", user.id)).opened).toBe(401);
    expect(await connect(`order=${order.id}`, await session("USER", user.id), "https://evil.example").opened).toBe(403);

    await sendChat(order.id, { type: "USER", userId: user.id }, "hello");
    await until(() => support.events.some((e) => e.type === "message"));
    await until(() => inbox.events.some((e) => e.type === "message"));

    customer.ws.send(JSON.stringify({ type: "typing" }));
    await until(() => support.events.some((e) => e.type === "typing" && e.from === "USER"));
    // Your own typing isn't sent back to you.
    expect(customer.events.some((e) => e.type === "typing")).toBe(false);

    support.ws.send(JSON.stringify({ type: "read" }));
    await until(() => customer.events.some((e) => e.type === "read" && e.by === "ADMIN"));

    for (const c of [customer, support, inbox]) c.ws.close();
  });
});
