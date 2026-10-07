import { audit, SYSTEM, type Actor } from "./audit";
import { decrypt, encrypt } from "./crypto";
import { prisma } from "./db";
import { AppError } from "./errors";
import { notifyKyc } from "./notify";
import { getSettings } from "./settings";
import { checkUpload, putFile, signedUrl } from "./storage";

// KYC is its own module so automatic checks (R2: PAN API, DigiLocker, selfie match) can slot in.

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const maskPan = (pan: string) => `${pan.slice(0, 5)}****${pan.slice(-1)}`;
export const DOC_FIELDS = ["panDoc", "aadhaarFront", "aadhaarBack", "selfie"] as const;
export type DocField = (typeof DOC_FIELDS)[number];
const KEY_COLUMN: Record<DocField, "panDocKey" | "aadhaarFrontKey" | "aadhaarBackKey" | "selfieKey"> = {
  panDoc: "panDocKey",
  aadhaarFront: "aadhaarFrontKey",
  aadhaarBack: "aadhaarBackKey",
  selfie: "selfieKey",
};

export interface KycInput {
  fullName: string;
  dob: string;
  pan: string;
  address: string;
  maskedConfirmed: boolean;
  files: Record<DocField, { buf: Buffer; type: string } | undefined>;
}

function age(dob: string, now = new Date()): number {
  const [y, m, d] = dob.split("-").map(Number);
  let a = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) a--;
  return a;
}

export async function submitKyc(userId: string, input: KycInput, actor: Actor) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const set = await getSettings();
  if (set.onboarding_mobile_required && !user.mobileVerifiedAt) throw new AppError("Confirm your mobile number first.");
  if (!["NOT_STARTED", "NEEDS_CHANGES"].includes(user.kycStatus)) throw new AppError("Your identity check is already submitted.");
  const fullName = input.fullName?.trim().replace(/\s+/g, " ");
  if (!fullName || fullName.length < 3) throw new AppError("Enter your full name exactly as on your PAN card.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dob ?? "") || isNaN(Date.parse(input.dob))) throw new AppError("Enter your date of birth.");
  if (age(input.dob) < 18) throw new AppError("You must be 18 or older.");
  const pan = (input.pan ?? "").trim().toUpperCase();
  if (!PAN_RE.test(pan)) throw new AppError("Enter a valid PAN, e.g. ABCDE1234F.");
  if (!input.address?.trim() || input.address.trim().length < 10) throw new AppError("Enter your full residential address.");
  // Spec 10.2: we never accept an unmasked Aadhaar.
  if (!input.maskedConfirmed) throw new AppError("Please upload the MASKED Aadhaar (first 8 digits hidden) and tick the box to confirm.");

  // On resubmission, files not re-uploaded are carried over from the previous submission.
  const prev = user.kycStatus === "NEEDS_CHANGES" ? await prisma.kycSubmission.findFirst({ where: { userId }, orderBy: { submittedAt: "desc" } }) : null;
  const keys = {} as Record<(typeof KEY_COLUMN)[DocField], string>;
  for (const f of DOC_FIELDS) {
    const file = input.files[f];
    if (file && file.buf.length > 0) {
      const type = checkUpload(file.buf, file.type);
      keys[KEY_COLUMN[f]] = await putFile(`kyc/${userId}`, file.buf, type);
    } else if (prev) keys[KEY_COLUMN[f]] = prev[KEY_COLUMN[f]];
    else throw new AppError("Please upload all four documents.");
  }
  // Automatic approval: the basic checks above passed, so approve now and
  // leave the submission in the admin's "review later" queue.
  const auto = set.kyc_auto_approve;
  const status = auto ? "APPROVED" : "SUBMITTED";
  const sub = await prisma.$transaction(async (tx) => {
    const s = await tx.kycSubmission.create({
      data: {
        userId, fullName, dob: input.dob, panEncrypted: encrypt(pan), panMasked: maskPan(pan), address: input.address.trim(), maskedConfirmed: true,
        status, autoApproved: auto, reviewedAt: auto ? new Date() : null, ...keys,
      },
    });
    await tx.user.update({ where: { id: userId }, data: { kycStatus: status } });
    return s;
  });
  await audit(actor, "KYC_SUBMITTED", { targetType: "kyc_submission", targetId: sub.id });
  if (auto) {
    await audit(SYSTEM, "KYC_AUTO_APPROVED", { targetType: "kyc_submission", targetId: sub.id });
    await notifyKyc(userId, "APPROVED");
  }
  return sub;
}

export async function reviewKyc(submissionId: string, decision: "APPROVED" | "NEEDS_CHANGES" | "DECLINED", reason: string | undefined, actor: Actor) {
  if (decision !== "APPROVED" && !reason?.trim()) throw new AppError("A reason is required.");
  const sub = await prisma.kycSubmission.findUnique({ where: { id: submissionId } });
  if (!sub) throw new AppError("Submission not found", 404);
  const postReview = sub.status === "APPROVED" && sub.autoApproved && !sub.postReviewedAt;
  if (sub.status !== "SUBMITTED" && !postReview) throw new AppError("This submission was already reviewed.");
  if (postReview) {
    // Checking an automatically approved submission after the fact.
    const now = new Date();
    await prisma.$transaction([
      prisma.kycSubmission.update({
        where: { id: sub.id },
        data: { status: decision, reason: reason?.trim() || null, postReviewedAt: now, postReviewedBy: actor.id, ...(decision === "APPROVED" ? {} : { reviewerId: actor.id, reviewedAt: now }) },
      }),
      prisma.user.update({ where: { id: sub.userId }, data: { kycStatus: decision } }),
    ]);
    await audit(actor, decision === "APPROVED" ? "KYC_AUTO_CONFIRMED" : `KYC_${decision}`, { targetType: "kyc_submission", targetId: sub.id, details: { reason: reason ?? null, afterAutoApproval: true } });
    if (decision !== "APPROVED") await notifyKyc(sub.userId, decision, reason);
    return;
  }
  await prisma.$transaction([
    prisma.kycSubmission.update({ where: { id: sub.id }, data: { status: decision, reason: reason?.trim() || null, reviewerId: actor.id, reviewedAt: new Date() } }),
    prisma.user.update({ where: { id: sub.userId }, data: { kycStatus: decision } }),
  ]);
  await audit(actor, `KYC_${decision}`, { targetType: "kyc_submission", targetId: sub.id, details: { reason: reason ?? null } });
  await notifyKyc(sub.userId, decision, reason);
}

/** Every document view is logged (spec 5.2). */
export async function kycDocLink(submissionId: string, doc: DocField, actor: Actor, ip: string | null) {
  const sub = await prisma.kycSubmission.findUnique({ where: { id: submissionId } });
  if (!sub) throw new AppError("Submission not found", 404);
  if (!DOC_FIELDS.includes(doc)) throw new AppError("Unknown document");
  await audit(actor, "KYC_DOC_VIEWED", { targetType: "kyc_submission", targetId: sub.id, details: { doc, userId: sub.userId }, ip });
  return signedUrl(sub[KEY_COLUMN[doc]]);
}

export async function latestKyc(userId: string) {
  return prisma.kycSubmission.findFirst({ where: { userId }, orderBy: { submittedAt: "desc" } });
}

export const fullPan = (encrypted: string) => decrypt(encrypted);
