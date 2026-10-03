import { beforeEach, describe, expect, it, vi } from "vitest";

// A cookie jar standing in for the browser.
const jar = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.cookies[n] ? { value: jar.cookies[n] } : undefined),
    set: () => undefined,
    delete: (n: string) => void delete jar.cookies[n],
  }),
  headers: async () => new Headers(),
}));

import { prisma } from "@/server/db";
import { randomToken, sha256 } from "@/server/crypto";
import { ADMIN_IDLE_MS, adminSessionTimes, currentAdmin, touchAdminSession } from "@/server/auth/session";
import { baseSettings, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await baseSettings();
  jar.cookies = {};
});

async function adminSession(idleForMs: number) {
  const a = await prisma.admin.create({ data: { name: "A", email: "a@test.dev", passwordHash: "x", totpEnabled: true } });
  const token = randomToken();
  const lastSeenAt = new Date(Date.now() - idleForMs);
  await prisma.session.create({ data: { id: sha256(token), subjectType: "ADMIN", subjectId: a.id, stage: "FULL", lastSeenAt, expiresAt: new Date(Date.now() + 3600_000) } });
  jar.cookies.asid = token;
  return { id: sha256(token), lastSeenAt };
}

describe("admin auto-logout (30 minutes without activity)", () => {
  it("background requests don't keep the session alive", async () => {
    const s = await adminSession(10 * 60_000);
    expect(await currentAdmin()).not.toBeNull(); // e.g. the 20-second live update
    const after = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.lastSeenAt.getTime()).toBe(s.lastSeenAt.getTime());
    const t = (await adminSessionTimes())!;
    expect(t.idleEndsAt.getTime()).toBe(s.lastSeenAt.getTime() + ADMIN_IDLE_MS);
  });

  it("real activity restarts the clock", async () => {
    const s = await adminSession(25 * 60_000);
    await touchAdminSession();
    const after = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(Date.now() - after.lastSeenAt.getTime()).toBeLessThan(5_000);
  });

  it("after 30 idle minutes the session is gone", async () => {
    const s = await adminSession(31 * 60_000);
    expect(await currentAdmin()).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: s.id } })).toBeNull();
  });
});
