import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { adminCounts } from "@/server/adminCounts";
import { adminPulse, userPulse } from "@/server/pulse";
import { transition } from "@/server/orders/stateMachine";
import { baseSettings, makeOrder, makeUser, resetDb } from "./helpers";

const SYS = { type: "SYSTEM" as const, id: null };

beforeEach(async () => {
  await resetDb();
  await baseSettings();
});

describe("admin menu counts (one query)", () => {
  it("match the queues counted one by one", async () => {
    const { order } = await makeOrder("TRON", "100");
    await prisma.$transaction((tx) => transition(tx, order.id, "PAYMENT_CONFIRMED", SYS));
    const u = await makeUser();
    await prisma.payoutMethod.create({ data: { userId: u.user.id, type: "UPI", holderName: "A B", upiId: "a@b", status: "PENDING" } });
    await prisma.supportMessage.create({ data: { userId: u.user.id, message: "help" } });
    const c = await adminCounts();
    expect(c.work).toBe(await prisma.order.count({ where: { status: { in: ["PAYMENT_CONFIRMED", "UNDER_REVIEW", "ON_HOLD", "APPROVED"] } } }));
    expect(c.payout).toBe(await prisma.payoutMethod.count({ where: { status: "PENDING", deletedAt: null } }));
    expect(c.kyc).toBe(await prisma.kycSubmission.count({ where: { OR: [{ status: "SUBMITTED" }, { autoApproved: true, postReviewedAt: null, status: "APPROVED" }] } }));
    expect(c.support).toBe(1);
    expect(c.kycSubmitted).toBe(await prisma.kycSubmission.count({ where: { status: "SUBMITTED" } }));
    expect(c.kycAuto).toBe(await prisma.kycSubmission.count({ where: { autoApproved: true, postReviewedAt: null, status: "APPROVED" } }));
    expect(c.kyc).toBe(c.kycSubmitted + c.kycAuto);
    expect(c.reviews).toBe(c.kyc + c.payout);
    expect(c.work).toBe(1);
  });
});

describe("live-update checks", () => {
  it("admin: the answer changes when an order moves, and only then", async () => {
    const { order } = await makeOrder("TRON", "100");
    const a = (await adminPulse()).sig;
    expect((await adminPulse()).sig).toBe(a);
    await prisma.$transaction((tx) => transition(tx, order.id, "PAYMENT_CONFIRMED", SYS));
    expect((await adminPulse()).sig).not.toBe(a);
  });

  it("customer: changes for their own orders, not someone else's", async () => {
    const mine = await makeOrder("TRON", "100");
    const other = await makeOrder("TRON", "50");
    const before = (await userPulse(mine.user.id)).sig;
    await prisma.$transaction((tx) => transition(tx, other.order.id, "PAYMENT_CONFIRMED", SYS));
    expect((await userPulse(mine.user.id)).sig).toBe(before);
    await prisma.$transaction((tx) => transition(tx, mine.order.id, "PAYMENT_CONFIRMED", SYS));
    expect((await userPulse(mine.user.id)).sig).not.toBe(before);
  });
});
