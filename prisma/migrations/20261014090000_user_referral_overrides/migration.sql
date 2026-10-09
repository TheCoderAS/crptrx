-- Super admin overrides for one user's referral code: switch it off, or change its reward rules.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "referralDisabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referralMaxPoints" INTEGER,
ADD COLUMN     "referralMode" TEXT,
ADD COLUMN     "referralPointsPerUsdt" DECIMAL(10,2);


ALTER TABLE "users" ADD CONSTRAINT "users_referral_mode_valid" CHECK ("referralMode" IS NULL OR "referralMode" IN ('FIRST', 'EVERY'));
