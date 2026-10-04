import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { registerWithPassword } from "@/server/auth/password";
import { upsertUserFromIdentity } from "@/server/auth/user";
import { adminForInviteCode, checkReferralFields, reassignCustomer, releaseCustomers, resolveInvite } from "@/server/referral";
import { baseSettings, resetDb } from "./helpers";

const SUPER = { type: "ADMIN" as const, id: "super-1" };
let seq = 0;
const makeAdmin = (over: Partial<{ inviteCode: string | null; role: "ADMIN" | "SUPER_ADMIN"; status: "ACTIVE" | "DISABLED"; profitPercent: string }> = {}) =>
  prisma.admin.create({ data: { name: `Admin ${++seq}`, email: `a${seq}-${Date.now()}@admin.dev`, passwordHash: "x", totpEnabled: true, inviteCode: `CODE${seq}X`, ...over } });

beforeEach(async () => {
  await resetDb();
  await baseSettings();
});

describe("invite codes", () => {
  it("finds an active admin by code, any letter case and spaces", async () => {
    const a = await makeAdmin({ inviteCode: "RAVI2026" });
    expect((await adminForInviteCode(" ravi 2026 "))?.id).toBe(a.id);
    expect(await resolveInvite("ravi2026")).toBe(a.id);
    expect(await resolveInvite("")).toBeNull();
  });

  it("refuses an unknown code, a disabled admin's code and a super admin's code", async () => {
    await makeAdmin({ inviteCode: "OLDCODE1", status: "DISABLED" });
    await makeAdmin({ inviteCode: "BOSSCODE", role: "SUPER_ADMIN" });
    for (const c of ["NOPE1234", "OLDCODE1", "BOSSCODE"]) await expect(resolveInvite(c)).rejects.toThrow(/Code not found/);
    expect(await resolveInvite("NOPE1234", true)).toBeNull(); // remembered from an old link: ignored
  });

  it("checks the code and share the super admin types", () => {
    expect(() => checkReferralFields({ inviteCode: "AB!", profitPercent: "10" })).toThrow(/Invite code/);
    expect(() => checkReferralFields({ inviteCode: "GOOD1234", profitPercent: "101" })).toThrow(/Profit share/);
    expect(checkReferralFields({ inviteCode: "good1234", profitPercent: "" })).toEqual({ inviteCode: "GOOD1234", profitPercent: "0" });
  });
});

describe("sign-up tags the customer", () => {
  it("email sign-up with a code", async () => {
    const a = await makeAdmin({ inviteCode: "EMAILREF" });
    const u = await registerWithPassword("ref1@example.com", "correct horse", "9.9.9.1", "emailref");
    expect(u?.adminId).toBe(a.id);
    expect(u?.referredAt).toBeTruthy();
  });

  it("email sign-up with a wrong code is refused before any account is made", async () => {
    await expect(registerWithPassword("ref2@example.com", "correct horse", "9.9.9.2", "WRONG999")).rejects.toThrow(/Code not found/);
    expect(await prisma.user.count({ where: { email: "ref2@example.com" } })).toBe(0);
  });

  it("no code: the customer is the house's", async () => {
    const u = await registerWithPassword("ref3@example.com", "correct horse", "9.9.9.3");
    expect(u?.adminId).toBeNull();
  });

  it("Google: a new account gets the code, an existing one keeps its admin", async () => {
    const a = await makeAdmin({ inviteCode: "GOOGREF1" });
    const b = await makeAdmin({ inviteCode: "GOOGREF2" });
    const u = await upsertUserFromIdentity({ uid: "g-ref", email: "gref@example.com", emailVerified: true }, null, { code: "GOOGREF1" });
    expect(u.adminId).toBe(a.id);
    const again = await upsertUserFromIdentity({ uid: "g-ref", email: "gref@example.com", emailVerified: true }, null, { code: "GOOGREF2" });
    expect(again.adminId).toBe(a.id); // a customer can't switch admins by signing in with another code
    expect(b.id).not.toBe(a.id);
  });

  it("Google from the log-in page: a stale remembered code is ignored", async () => {
    const u = await upsertUserFromIdentity({ uid: "g-stale", email: "stale@example.com", emailVerified: true }, null, { code: "GONE0000", soft: true });
    expect(u.adminId).toBeNull();
  });
});

describe("moving customers", () => {
  it("super admin moves a customer, with a logged reason", async () => {
    const a = await makeAdmin();
    const b = await makeAdmin();
    const u = await prisma.user.create({ data: { email: "mv@example.com", adminId: a.id } });
    await expect(reassignCustomer(u.id, b.id, SUPER, "")).rejects.toThrow(/why/);
    await reassignCustomer(u.id, b.id, SUPER, "Asked to move to Ravi");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).adminId).toBe(b.id);
    await reassignCustomer(u.id, null, SUPER, "Back to the house");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).adminId).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "CUSTOMER_REASSIGNED", targetId: u.id } })).toBe(2);
  });

  it("can't move a customer to a disabled admin or a super admin", async () => {
    const off = await makeAdmin({ status: "DISABLED" });
    const boss = await makeAdmin({ role: "SUPER_ADMIN", inviteCode: null });
    const u = await prisma.user.create({ data: { email: "mv2@example.com" } });
    await expect(reassignCustomer(u.id, off.id, SUPER, "trying it")).rejects.toThrow(/active admin/);
    await expect(reassignCustomer(u.id, boss.id, SUPER, "trying it")).rejects.toThrow(/active admin/);
  });

  it("disabling an admin sends their customers to the house", async () => {
    const a = await makeAdmin();
    await prisma.user.createMany({ data: [{ email: "c1@example.com", adminId: a.id }, { email: "c2@example.com", adminId: a.id }] });
    const n = await prisma.$transaction((tx) => releaseCustomers(a.id, SUPER, tx));
    expect(n).toBe(2);
    expect(await prisma.user.count({ where: { adminId: a.id } })).toBe(0);
  });
});
