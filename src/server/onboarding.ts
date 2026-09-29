import type { User } from "@prisma/client";
import { prisma, type Tx } from "./db";
import { getSettings, type Settings } from "./settings";

/**
 * The onboarding flow, computed from the CURRENT admin settings every time.
 * Every screen and the order check use this one function, so changing a
 * setting never leaves a page and the server disagreeing.
 */
export type StepId = "mobile" | "kyc" | "payout" | "wallet";
export interface Step {
  id: StepId;
  required: boolean; // counts toward "ready to sell"
  done: boolean;
  waiting: boolean; // submitted, waiting for our review
  locked: boolean; // an earlier step must be finished first
}
export interface Onboarding {
  steps: Step[]; // only steps that apply under current settings
  ready: boolean;
  blockedReason: string | null; // e.g. KYC declined
  next: Step | null;
}

export async function onboardingState(user: User, s?: Settings, tx: Tx = prisma): Promise<Onboarding> {
  const set = s ?? (await getSettings(tx));
  const [approvedPm, pendingPm, wallets] = await Promise.all([
    tx.payoutMethod.count({ where: { userId: user.id, status: "APPROVED", deletedAt: null } }),
    tx.payoutMethod.count({ where: { userId: user.id, status: "PENDING", deletedAt: null } }),
    set.wallet_registration === "OFF" ? Promise.resolve(0) : tx.userWallet.count({ where: { userId: user.id, deletedAt: null } }),
  ]);
  const mobileDone = !!user.mobileVerifiedAt;
  const kycDone = user.kycStatus === "APPROVED";
  const steps: Step[] = [];
  if (set.onboarding_mobile_required) steps.push({ id: "mobile", required: true, done: mobileDone, waiting: false, locked: false });
  if (set.kyc_required)
    steps.push({ id: "kyc", required: true, done: kycDone, waiting: user.kycStatus === "SUBMITTED", locked: set.onboarding_mobile_required && !mobileDone });
  steps.push({
    id: "payout",
    required: true,
    done: approvedPm > 0,
    waiting: approvedPm === 0 && pendingPm > 0,
    locked: set.kyc_required && !kycDone,
  });
  if (set.wallet_registration !== "OFF")
    steps.push({ id: "wallet", required: set.wallet_registration === "REQUIRED", done: wallets > 0, waiting: false, locked: false });

  let blockedReason: string | null = null;
  if (user.status !== "ACTIVE") blockedReason = "Your account can't place orders. Please contact support.";
  // A declined identity check keeps blocking even if KYC is later switched off.
  else if (user.kycStatus === "DECLINED") blockedReason = "Your identity check was declined, so you can't place orders.";
  const ready = !blockedReason && steps.every((x) => !x.required || x.done);
  return { steps, ready, blockedReason, next: steps.find((x) => x.required && !x.done && !x.locked) ?? null };
}

/** Human message for the first thing stopping a user from ordering. */
export function notReadyMessage(o: Onboarding): string {
  if (o.blockedReason) return o.blockedReason;
  const missing = o.steps.find((x) => x.required && !x.done);
  switch (missing?.id) {
    case "mobile":
      return "Please confirm your mobile number first.";
    case "kyc":
      return "Your identity check must be approved before you can sell USDT.";
    case "payout":
      return "Add a bank account or UPI ID and wait for approval before selling.";
    case "wallet":
      return "Add the wallet you'll send USDT from before selling.";
    default:
      return "Finish setting up your account first.";
  }
}
