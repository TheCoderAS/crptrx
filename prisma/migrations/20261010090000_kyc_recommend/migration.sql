-- An admin's approval of their own customer's identity check, waiting for a super admin.
ALTER TABLE "kyc_submissions" ADD COLUMN "recommendedBy" TEXT,
ADD COLUMN "recommendedAt" TIMESTAMP(3);
