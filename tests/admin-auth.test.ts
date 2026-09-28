import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { checkAdminTotp, hashPassword, verifyAdminPassword } from "@/server/auth/admin";
import { encrypt } from "@/server/crypto";
import { currentStep, generateTotpSecret, totpAt } from "@/server/totp";
import { resetDb } from "./helpers";

beforeEach(resetDb);

async function makeAdmin() {
  const secret = generateTotpSecret();
  const admin = await prisma.admin.create({
    data: { name: "A", email: "a@test.dev", passwordHash: await hashPassword("correct-horse-battery"), totpSecretEncrypted: encrypt(secret), totpEnabled: true },
  });
  return { admin, secret };
}

describe("admin login (spec 3, 4.1, 10.4)", () => {
  it("locks the account for 15 minutes after 5 wrong passwords", async () => {
    await makeAdmin();
    for (let i = 0; i < 5; i++) await expect(verifyAdminPassword("a@test.dev", "wrong-password", null)).rejects.toThrow(/Wrong email/);
    await expect(verifyAdminPassword("a@test.dev", "correct-horse-battery", null)).rejects.toThrow(/locked/);
    const a = await prisma.admin.findUniqueOrThrow({ where: { email: "a@test.dev" } });
    expect(a.lockedUntil!.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(await prisma.auditLog.count({ where: { action: "ADMIN_LOGIN_FAILED" } })).toBe(6);
  });

  it("accepts the right password", async () => {
    await makeAdmin();
    await expect(verifyAdminPassword("A@test.dev ", "correct-horse-battery", null)).resolves.toMatchObject({ email: "a@test.dev" });
  });

  it("a 2FA code works once and can't be replayed", async () => {
    const { admin, secret } = await makeAdmin();
    const code = totpAt(secret, currentStep());
    await checkAdminTotp(admin, code, "login", null);
    await expect(checkAdminTotp(admin, code, "mark_paid", null)).rejects.toThrow(/already used/);
    await expect(checkAdminTotp(admin, "000000", "mark_paid", null)).rejects.toThrow();
    expect(await prisma.auditLog.count({ where: { action: "ADMIN_2FA_FAILED" } })).toBe(2);
  });
});
