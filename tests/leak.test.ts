import { beforeAll, describe, expect, it, vi } from "vitest";

// A cookie jar standing in for the browser: whichever admin is "signed in" right now.
const jar = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.cookies[n] ? { value: jar.cookies[n] } : undefined),
    set: () => undefined,
    delete: (n: string) => void delete jar.cookies[n],
  }),
  headers: async () => new Headers({ host: "localhost" }),
}));
vi.mock("@/server/firebase/admin", () => ({ firebaseApp: () => null, logFirebaseError: () => undefined, liveChatReady: () => false }));

import type { Admin } from "@prisma/client";
import { prisma } from "@/server/db";
import { randomToken, sha256 } from "@/server/crypto";
import { encrypt } from "@/server/crypto";
import { adminCounts } from "@/server/adminCounts";
import { ownedScope, userScope } from "@/server/scope";
import { transition } from "@/server/orders/stateMachine";
import { baseSettings, makeOrder, resetDb } from "./helpers";

import * as orderRoute from "@/app/api/admin/orders/[id]/route";
import * as chatRoute from "@/app/api/admin/orders/[id]/chat/route";
import * as chatRead from "@/app/api/admin/orders/[id]/chat/read/route";
import * as chatStatus from "@/app/api/admin/orders/[id]/chat/status/route";
import * as kycRoute from "@/app/api/admin/kyc/[id]/route";
import * as kycDoc from "@/app/api/admin/kyc/[id]/doc/route";
import * as pmRoute from "@/app/api/admin/payout-methods/[id]/route";
import * as supportRoute from "@/app/api/admin/support/[id]/route";
import * as supportFile from "@/app/api/admin/support/[id]/file/route";
import * as userRoute from "@/app/api/admin/users/[id]/route";
import * as receiptRoute from "@/app/api/orders/[id]/receipt/route";
import * as transferRoute from "@/app/api/admin/transfers/[id]/route";
import * as rewardRoute from "@/app/api/admin/users/[id]/reward/route";
import * as settleRoute from "@/app/api/admin/earnings/settle/route";
import * as voidRoute from "@/app/api/admin/earnings/[id]/void/route";
import * as requestRoute from "@/app/api/admin/earnings/requests/[id]/route";

const SYS = { type: "SYSTEM" as const, id: null };

async function signIn(a: Admin) {
  const token = randomToken();
  await prisma.session.create({ data: { id: sha256(token), subjectType: "ADMIN", subjectId: a.id, stage: "FULL", expiresAt: new Date(Date.now() + 3600_000), stepUpAt: new Date() } });
  jar.cookies = { asid: token };
}

const req = (method: "GET" | "POST", body?: Record<string, unknown>) =>
  new Request("http://localhost/api/x", {
    method,
    headers: { origin: "http://localhost", host: "localhost", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let ravi: Admin, sita: Admin, boss: Admin;
let ids: { userId: string; orderId: string; kycId: string; pmId: string; supportId: string };
let houseOrderId: string;

beforeAll(async () => {
  await resetDb();
  await baseSettings();
  const mk = (name: string, role: "ADMIN" | "SUPER_ADMIN", inviteCode: string | null) =>
    prisma.admin.create({ data: { name, email: `${name.toLowerCase()}@admin.dev`, passwordHash: "x", totpEnabled: true, role, inviteCode } });
  [ravi, sita, boss] = await Promise.all([mk("Ravi", "ADMIN", "RAVI0001"), mk("Sita", "ADMIN", "SITA0001"), mk("Boss", "SUPER_ADMIN", null)]);

  // Ravi's customer, with one of everything.
  const { order, user } = await makeOrder("TRON", "100");
  await prisma.user.update({ where: { id: user.id }, data: { adminId: ravi.id } });
  const kyc = await prisma.kycSubmission.create({
    data: { userId: user.id, fullName: "Ravi Customer", dob: "1990-01-01", panEncrypted: encrypt("ABCDE1234F"), panMasked: "ABCDE****F", address: "1 Long Street, Pune", panDocKey: "k1", aadhaarFrontKey: "k2", aadhaarBackKey: "k3", selfieKey: "k4", maskedConfirmed: true, status: "SUBMITTED" },
  });
  const pm = await prisma.payoutMethod.create({ data: { userId: user.id, type: "UPI", holderName: "Ravi Customer", upiId: "rc@upi", status: "PENDING" } });
  const support = await prisma.supportMessage.create({ data: { userId: user.id, message: "help", attachmentKey: "chat/x.png" } });
  ids = { userId: user.id, orderId: order.id, kycId: kyc.id, pmId: pm.id, supportId: support.id };
  // A house customer (no admin).
  houseOrderId = (await makeOrder("TRON", "50")).order.id;
});

/** Every admin endpoint that touches one customer's data, called for a given record. */
const calls = (o: { orderId: string; kycId: string; pmId: string; supportId: string; userId: string }) => [
  ["order action", () => orderRoute.POST(req("POST", { action: "note", note: "peek" }), ctx(o.orderId))],
  ["order chat (read)", () => chatRoute.GET(req("GET"), ctx(o.orderId))],
  ["order chat (mark read)", () => chatRead.POST(req("POST", {}), ctx(o.orderId))],
  ["order chat (resolve)", () => chatStatus.POST(req("POST", { resolved: true }), ctx(o.orderId))],
  ["identity decision", () => kycRoute.POST(req("POST", { decision: "DECLINED", reason: "peek" }), ctx(o.kycId))],
  ["identity document", () => kycDoc.GET(new Request(`http://localhost/api/x?doc=selfie&format=json`), ctx(o.kycId))],
  ["bank/UPI decision", () => pmRoute.POST(req("POST", { decision: "DECLINED", reason: "peek" }), ctx(o.pmId))],
  ["support message handled", () => supportRoute.POST(req("POST", {}), ctx(o.supportId))],
  ["support attachment", () => supportFile.GET(new Request("http://localhost/api/x?format=json"), ctx(o.supportId))],
  ["disable customer", () => userRoute.POST(req("POST", { action: "disable", reason: "peek" }), ctx(o.userId))],
  ["receipt PDF", () => receiptRoute.GET(req("GET"), ctx(o.orderId))],
  ["customer bonus", () => rewardRoute.POST(req("POST", { rewardPercent: "5" }), ctx(o.userId))],
] as const;

describe("an admin can't reach another admin's customers (all answer 404)", () => {
  it("every endpoint, as the wrong admin", async () => {
    await signIn(sita);
    for (const [name, call] of calls(ids)) {
      const res = (await call()) as Response;
      expect(res.status, name).toBe(404);
    }
    // Nothing changed behind the 404s.
    expect((await prisma.kycSubmission.findUniqueOrThrow({ where: { id: ids.kycId } })).status).toBe("SUBMITTED");
    expect((await prisma.payoutMethod.findUniqueOrThrow({ where: { id: ids.pmId } })).status).toBe("PENDING");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.userId } })).status).toBe("ACTIVE");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.userId } })).rewardPercent.toString()).toBe("0");
    expect(await prisma.adminNote.count({ where: { orderId: ids.orderId } })).toBe(0);
  });

  it("house customers (no admin) are hidden from every admin", async () => {
    await signIn(ravi);
    const res = (await orderRoute.POST(req("POST", { action: "note", note: "peek" }), ctx(houseOrderId))) as Response;
    expect(res.status).toBe(404);
    expect((await receiptRoute.GET(req("GET"), ctx(houseOrderId))).status).toBe(404);
  });

  it("the right admin gets through", async () => {
    await signIn(ravi);
    expect(((await orderRoute.POST(req("POST", { action: "note", note: "my customer" }), ctx(ids.orderId))) as Response).status).toBe(200);
    expect(((await chatRoute.GET(req("GET"), ctx(ids.orderId))) as Response).status).toBe(200);
  });

  it("lists and counts only show the admin's own customers", async () => {
    const seen = async (a: Admin) => (await prisma.order.findMany({ where: ownedScope(a), select: { id: true } })).map((o) => o.id);
    expect(await seen(ravi)).toEqual([ids.orderId]);
    expect(await seen(sita)).toEqual([]);
    expect((await seen(boss)).sort()).toEqual([ids.orderId, houseOrderId].sort());
    expect(await prisma.user.count({ where: userScope(sita) })).toBe(0);
    const c = await adminCounts(sita);
    expect([c.kyc, c.payout, c.support, c.work, c.unmatched]).toEqual([0, 0, 0, 0, 0]);
    const r = await adminCounts(ravi);
    expect(r.kyc).toBe(1);
    expect(r.payout).toBe(1);
  });

  it("paying out and cancelling earnings are super admin only", async () => {
    await signIn(ravi);
    expect([403, 404]).toContain(((await settleRoute.POST(req("POST", { adminId: ravi.id }))) as Response).status);
    expect([403, 404]).toContain(((await voidRoute.POST(req("POST", { reason: "trying it" }), ctx("any"))) as Response).status);
  });

  it("payout requests: an admin can't decline, or cancel another admin's", async () => {
    const r = await prisma.adminPayoutRequest.create({ data: { adminId: ravi.id, amount: "10.00" } });
    await signIn(sita);
    expect(((await requestRoute.POST(req("POST", { action: "cancel" }), ctx(r.id))) as Response).status).toBe(404);
    await signIn(ravi);
    expect(((await requestRoute.POST(req("POST", { action: "decline", reason: "not me deciding" }), ctx(r.id))) as Response).status).toBe(404);
    expect((await prisma.adminPayoutRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("OPEN");
    expect(((await requestRoute.POST(req("POST", { action: "cancel" }), ctx(r.id))) as Response).status).toBe(200);
  });

  it("unmatched payments are super admin only", async () => {
    await signIn(ravi);
    const res = (await transferRoute.POST(req("POST", { action: "manual", note: "x" }), ctx("any"))) as Response;
    expect([403, 404]).toContain(res.status);
  });
});

describe("fraud control: admins approve identity checks, only a super admin pays", () => {
  it("an admin approves their own customer's identity check directly", async () => {
    await signIn(ravi);
    expect(((await kycRoute.POST(req("POST", { decision: "APPROVED" }), ctx(ids.kycId))) as Response).status).toBe(200);
    const k = await prisma.kycSubmission.findUniqueOrThrow({ where: { id: ids.kycId } });
    expect(k.status).toBe("APPROVED");
    expect(k.reviewerId).toBe(ravi.id);
    expect((await adminCounts(ravi)).kyc).toBe(0);
  });

  it("only a super admin can mark an order paid", async () => {
    await prisma.$transaction(async (tx) => {
      for (const s of ["PAYMENT_CONFIRMED", "UNDER_REVIEW", "APPROVED"] as const) await transition(tx, ids.orderId, s, SYS);
    });
    const o = await prisma.order.findUniqueOrThrow({ where: { id: ids.orderId } });
    const pay = { action: "mark_paid", amount: o.net.toFixed(2), paidAt: new Date(Date.now() - 60_000).toISOString() };
    await signIn(ravi);
    expect(((await orderRoute.POST(req("POST", pay), ctx(ids.orderId))) as Response).status).toBe(403);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ids.orderId } })).status).toBe("APPROVED");
    expect((await adminCounts(ravi)).work).toBe(0); // approved = waiting for the super admin
    await signIn(boss);
    expect(((await orderRoute.POST(req("POST", pay), ctx(ids.orderId))) as Response).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ids.orderId } })).status).toBe("PAID");
  });
});
