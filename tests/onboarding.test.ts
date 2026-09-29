import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { HOLD, ingestTransfers } from "@/server/matching";
import { onboardingState } from "@/server/onboarding";
import { createQuote } from "@/server/orders/quote";
import { addPayoutMethod } from "@/server/payouts";
import { reviewKyc, submitKyc } from "@/server/kyc";
import { setNetworkMode, updateSetting, writeSetting } from "@/server/settings";
import { addWallet } from "@/server/wallets";
import {
  loginWithPassword,
  registerWithPassword,
  requestPasswordReset,
  resetPassword,
  setPassword,
  verifyEmail,
} from "@/server/auth/password";
import { upsertUserFromIdentity } from "@/server/auth/user";
import { sha256 } from "@/server/crypto";
import { baseSettings, makeOrder, makeUser, orderById, randTron, resetDb, transfer } from "./helpers";

process.env.STORAGE_LOCAL_DIR = `${tmpdir()}/usdt-test-uploads`;

const SYS = { type: "SYSTEM" as const, id: null };
const ADMIN = { type: "ADMIN" as const, id: "admin-1" };
const set = (k: string, v: unknown) => writeSetting(k as never, v, SYS);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const kycInput = (fullName = "Asha Kumar") => ({
  fullName,
  dob: "1990-01-01",
  pan: "ABCDE1234F",
  address: "12 MG Road, Bengaluru 560001",
  maskedConfirmed: true,
  files: Object.fromEntries(["panDoc", "aadhaarFront", "aadhaarBack", "selfie"].map((k) => [k, { buf: PNG, type: "image/png" }])) as never,
});

beforeEach(async () => {
  await resetDb();
  await baseSettings();
  await prisma.admin.create({ data: { id: ADMIN.id, name: "Reviewer", email: "reviewer@test.dev", passwordHash: "x" } });
});

async function bareUser(over: Record<string, unknown> = {}) {
  const u = await prisma.user.create({ data: { email: `u-${Math.random().toString(36).slice(2)}@test.dev`, emailVerified: true, ...over } });
  return { user: u, actor: { type: "USER" as const, id: u.id } };
}
const fresh = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });

describe("onboarding steps follow the admin settings", () => {
  it("default: mobile, KYC and payout are required, wallet hidden", async () => {
    const { user } = await bareUser();
    const o = await onboardingState(user);
    expect(o.steps.map((s) => s.id)).toEqual(["mobile", "kyc", "payout"]);
    expect(o.ready).toBe(false);
    expect(o.next?.id).toBe("mobile");
  });

  it("KYC off + mobile off: only a payout method is needed", async () => {
    await set("kyc_required", false);
    await set("onboarding_mobile_required", false);
    const { user, actor } = await bareUser();
    expect((await onboardingState(user)).steps.map((s) => s.id)).toEqual(["payout"]);
    const pm = await addPayoutMethod(user.id, { type: "UPI", holderName: "Asha Kumar", upiId: "asha@okhdfcbank" }, actor);
    expect(pm.status).toBe("PENDING"); // no identity on file, so never auto-approved
    await prisma.payoutMethod.update({ where: { id: pm.id }, data: { status: "APPROVED" } });
    expect((await onboardingState(await fresh(user.id))).ready).toBe(true);
    // And the server agrees: a quote can be created.
    const q = await createQuote({ userId: user.id, network: "TRON", amountType: "USDT", amount: "50", payoutMethodId: pm.id }, actor);
    expect(q.status).toBe("QUOTE_READY");
  });

  it("switching KYC back on mid-way blocks orders again without breaking open ones", async () => {
    await set("kyc_required", false);
    await set("onboarding_mobile_required", false);
    const { user, actor } = await bareUser();
    const pm = await prisma.payoutMethod.create({ data: { userId: user.id, type: "UPI", holderName: "A", upiId: "a@ok", status: "APPROVED", isDefault: true } });
    const open = await createQuote({ userId: user.id, network: "TRON", amountType: "USDT", amount: "50", payoutMethodId: pm.id }, actor);
    await set("kyc_required", true);
    await expect(createQuote({ userId: user.id, network: "TRON", amountType: "USDT", amount: "60", payoutMethodId: pm.id }, actor)).rejects.toThrow(/identity check/);
    expect((await orderById(open.id)).status).toBe("QUOTE_READY");
  });

  it("a declined identity check keeps blocking even when KYC is switched off", async () => {
    const { user } = await bareUser({ kycStatus: "DECLINED", mobileVerifiedAt: new Date() });
    await set("kyc_required", false);
    const o = await onboardingState(user);
    expect(o.ready).toBe(false);
    expect(o.blockedReason).toMatch(/declined/);
  });

  it("wallet REQUIRED adds a required step; OPTIONAL doesn't block", async () => {
    const { user } = await makeUser();
    await set("wallet_registration", "OPTIONAL");
    let o = await onboardingState(user);
    expect(o.ready).toBe(true);
    expect(o.steps.find((s) => s.id === "wallet")?.required).toBe(false);
    await set("wallet_registration", "REQUIRED");
    o = await onboardingState(user);
    expect(o.ready).toBe(false);
    expect(o.next?.id).toBe("wallet");
  });
});

describe("settings guard rails", () => {
  it("keeps at least one sign-in method on", async () => {
    process.env.FIREBASE_API_KEY = "k";
    process.env.FIREBASE_AUTH_DOMAIN = "d";
    process.env.FIREBASE_PROJECT_ID = "p";
    try {
      await updateSetting("auth_email_enabled", false, ADMIN);
      await expect(updateSetting("auth_google_enabled", false, ADMIN)).rejects.toThrow(/at least one/);
    } finally {
      delete process.env.FIREBASE_API_KEY;
      delete process.env.FIREBASE_AUTH_DOMAIN;
      delete process.env.FIREBASE_PROJECT_ID;
    }
  });

  it("won't turn email sign-in off when Google isn't configured", async () => {
    await expect(updateSetting("auth_email_enabled", false, ADMIN)).rejects.toThrow(/Firebase/);
  });

  it("KYC can't be switched off in Live, and Live can't start with KYC off", async () => {
    await updateSetting("kyc_required", false, ADMIN);
    await expect(setNetworkMode("LIVE", "SWITCH TO LIVE", ADMIN)).rejects.toThrow(/KYC/);
    await set("kyc_required", true);
    await set("network_mode", "LIVE");
    await expect(updateSetting("kyc_required", false, ADMIN)).rejects.toThrow(/Live/);
  });

  it("rejects an unknown wallet mode", async () => {
    await expect(updateSetting("wallet_registration", "SOMETIMES", ADMIN)).rejects.toThrow();
  });
});

describe("KYC auto-approval", () => {
  it("approves on submit, then an admin can still ask for changes", async () => {
    await set("kyc_auto_approve", true);
    const { user, actor } = await bareUser({ mobileVerifiedAt: new Date() });
    const sub = await submitKyc(user.id, kycInput(), actor);
    expect(sub.status).toBe("APPROVED");
    expect(sub.autoApproved).toBe(true);
    expect((await fresh(user.id)).kycStatus).toBe("APPROVED");

    await reviewKyc(sub.id, "NEEDS_CHANGES", "Selfie is blurry", ADMIN);
    expect((await fresh(user.id)).kycStatus).toBe("NEEDS_CHANGES");
    const after = await prisma.kycSubmission.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.postReviewedAt).not.toBeNull();
    await expect(reviewKyc(sub.id, "APPROVED", undefined, ADMIN)).rejects.toThrow(/already reviewed/);
  });

  it("confirming an auto-approved check leaves the user approved", async () => {
    await set("kyc_auto_approve", true);
    const { user, actor } = await bareUser({ mobileVerifiedAt: new Date() });
    const sub = await submitKyc(user.id, kycInput(), actor);
    await reviewKyc(sub.id, "APPROVED", undefined, ADMIN);
    expect((await fresh(user.id)).kycStatus).toBe("APPROVED");
    expect((await prisma.kycSubmission.findUniqueOrThrow({ where: { id: sub.id } })).postReviewedBy).toBe(ADMIN.id);
  });

  it("without auto-approval the submission waits; mobile check follows its switch", async () => {
    const { user, actor } = await bareUser();
    await expect(submitKyc(user.id, kycInput(), actor)).rejects.toThrow(/mobile/);
    await set("onboarding_mobile_required", false);
    const sub = await submitKyc(user.id, kycInput(), actor);
    expect(sub.status).toBe("SUBMITTED");
  });
});

describe("payout auto-approval on name match", () => {
  it("approves only when the holder name matches the approved KYC name", async () => {
    await set("kyc_auto_approve", true);
    await set("payout_auto_approve_on_name_match", true);
    const { user, actor } = await bareUser({ mobileVerifiedAt: new Date() });
    await submitKyc(user.id, kycInput("Asha Kumar"), actor);
    const good = await addPayoutMethod(user.id, { type: "UPI", holderName: "kumar asha", upiId: "asha@okhdfcbank" }, actor);
    expect(good.status).toBe("APPROVED");
    expect(good.autoApproved).toBe(true);
    const bad = await addPayoutMethod(user.id, { type: "UPI", holderName: "Ravi Singh", upiId: "ravi@okaxis" }, actor);
    expect(bad.status).toBe("PENDING");
  });
});

describe("registered sending wallets", () => {
  it("holds a payment from an unregistered wallet when wallets are required", async () => {
    // The order exists before the switch; its payment is still checked against the new rule.
    const { order } = await makeOrder("TRON", "100");
    await set("wallet_registration", "REQUIRED");
    await ingestTransfers([transfer("TRON", order.usdtAmount.toString())]);
    const o = await orderById(order.id);
    expect(o.status).toBe("ON_HOLD");
    expect(o.holdReason).toBe(HOLD.UNKNOWN_WALLET);
  });

  it("confirms a payment from a registered wallet", async () => {
    const { order, user, actor } = await makeOrder("TRON", "100");
    await set("wallet_registration", "REQUIRED");
    const from = randTron();
    await addWallet(user.id, { network: "TRON", address: from }, actor);
    await ingestTransfers([transfer("TRON", order.usdtAmount.toString(), { from })]);
    expect((await orderById(order.id)).status).toBe("PAYMENT_CONFIRMED");
  });

  it("validates addresses and refuses someone else's or our own", async () => {
    await set("wallet_registration", "OPTIONAL");
    const a = await makeUser();
    const b = await makeUser();
    await expect(addWallet(a.user.id, { network: "TRON", address: "0x123" }, a.actor)).rejects.toThrow(/valid Tron/);
    const w = randTron();
    await addWallet(a.user.id, { network: "TRON", address: w }, a.actor);
    await expect(addWallet(b.user.id, { network: "TRON", address: w }, b.actor)).rejects.toThrow(/another account/);
    const ours = (await prisma.setting.findUniqueOrThrow({ where: { key: "deposit_address" } })).value as { TEST: { TRON: string } };
    await expect(addWallet(b.user.id, { network: "TRON", address: ours.TEST.TRON }, b.actor)).rejects.toThrow(/deposit address/);
  });

  it("refuses to add wallets when the feature is off", async () => {
    const a = await makeUser();
    await expect(addWallet(a.user.id, { network: "TRON", address: randTron() }, a.actor)).rejects.toThrow(/turned off/);
  });
});

describe("email and password sign-in", () => {
  const lastToken = async (userId: string, purpose: string) => {
    // Tokens are only stored hashed, so read the link from the outbox like a user would.
    const msg = await prisma.outboundMessage.findFirstOrThrow({ where: { to: (await fresh(userId)).email }, orderBy: { createdAt: "desc" } });
    const token = msg.body.match(/token=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();
    const row = await prisma.emailToken.findUniqueOrThrow({ where: { tokenHash: sha256(token!) } });
    expect(row.purpose).toBe(purpose);
    return token!;
  };

  it("sign up, confirm email, log in", async () => {
    const u = await registerWithPassword("New@Example.com", "correct horse", "1.1.1.1");
    expect(u?.email).toBe("new@example.com");
    expect(u?.emailVerified).toBe(false);
    await verifyEmail(await lastToken(u!.id, "VERIFY_EMAIL"));
    expect((await fresh(u!.id)).emailVerified).toBe(true);
    const logged = await loginWithPassword("new@example.com", "correct horse", "1.1.1.1");
    expect(logged.id).toBe(u!.id);
  });

  it("does not reveal an existing email on sign-up", async () => {
    await registerWithPassword("dup@example.com", "password-1", "1.1.1.2");
    expect(await registerWithPassword("dup@example.com", "password-2", "1.1.1.2")).toBeNull();
    // The original password still works.
    await expect(loginWithPassword("dup@example.com", "password-1", "1.1.1.2")).resolves.toBeTruthy();
  });

  it("locks after 5 wrong passwords", async () => {
    await registerWithPassword("lock@example.com", "password-1", "1.1.1.3");
    for (let i = 0; i < 5; i++) await expect(loginWithPassword("lock@example.com", "nope-nope", "1.1.1.3")).rejects.toThrow(/Wrong/);
    await expect(loginWithPassword("lock@example.com", "password-1", "1.1.1.3")).rejects.toThrow(/15 minutes/);
  });

  it("reset link works once and signs out other sessions", async () => {
    const u = await registerWithPassword("reset@example.com", "password-1", "1.1.1.4");
    await prisma.session.create({ data: { id: "s1", subjectType: "USER", subjectId: u!.id, stage: "FULL", expiresAt: new Date(Date.now() + 3600_000) } });
    await requestPasswordReset("reset@example.com", "1.1.1.4");
    const token = await lastToken(u!.id, "RESET_PASSWORD");
    await resetPassword(token, "password-2", "1.1.1.4");
    await expect(resetPassword(token, "password-3", "1.1.1.4")).rejects.toThrow(/expired or was already used/);
    expect(await prisma.session.count({ where: { subjectId: u!.id } })).toBe(0);
    await expect(loginWithPassword("reset@example.com", "password-2", "1.1.1.4")).resolves.toBeTruthy();
  });

  it("forgot-password is silent for unknown emails", async () => {
    await expect(requestPasswordReset("ghost@example.com", "1.1.1.5")).resolves.toBeUndefined();
  });

  it("is refused when the admin turns email sign-in off", async () => {
    await registerWithPassword("off@example.com", "password-1", "1.1.1.6");
    await set("auth_email_enabled", false);
    await expect(loginWithPassword("off@example.com", "password-1", "1.1.1.6")).rejects.toThrow(/turned off/);
    await expect(registerWithPassword("x@example.com", "password-1", "1.1.1.6")).rejects.toThrow(/turned off/);
  });

  it("changing a password needs the current one; Google users can set a first one", async () => {
    const u = await registerWithPassword("chg@example.com", "password-1", "1.1.1.7");
    await expect(setPassword(u!, "wrong", "password-2", null)).rejects.toThrow(/current password/);
    await setPassword(u!, "password-1", "password-2", null);
    const { user: g } = await bareUser({ firebaseUid: "google-uid-1" });
    await setPassword(g, undefined, "first-password", null);
    await expect(loginWithPassword(g.email, "first-password", "1.1.1.7")).resolves.toBeTruthy();
  });

  it("Google sign-in removes a password set on an unconfirmed email (takeover guard)", async () => {
    const squatter = await registerWithPassword("victim@example.com", "squatter-pw", "1.1.1.8");
    const u = await upsertUserFromIdentity({ uid: "g-victim", email: "victim@example.com", emailVerified: true }, null);
    expect(u.id).toBe(squatter!.id);
    expect(u.passwordHash).toBeNull();
    await expect(loginWithPassword("victim@example.com", "squatter-pw", "1.1.1.8")).rejects.toThrow(/Wrong/);
  });
});
