-- User-to-user referrals: each user's own code, who invited whom, points earned on friends'
-- paid sales, and points spent on the user's own orders.
-- CreateEnum
CREATE TYPE "PointStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('HELD', 'SPENT', 'RELEASED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "pointsUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT;

-- CreateTable
CREATE TABLE "referral_points" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "usdt" DECIMAL(38,18) NOT NULL,
    "points" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "status" "PointStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "cancelledBy" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_redemptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'HELD',
    "allocations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_points_orderId_key" ON "referral_points"("orderId");

-- CreateIndex
CREATE INDEX "referral_points_userId_status_idx" ON "referral_points"("userId", "status");

-- CreateIndex
CREATE INDEX "referral_points_fromUserId_idx" ON "referral_points"("fromUserId");

-- CreateIndex
CREATE INDEX "referral_points_createdAt_idx" ON "referral_points"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "point_redemptions_orderId_key" ON "point_redemptions"("orderId");

-- CreateIndex
CREATE INDEX "point_redemptions_userId_status_idx" ON "point_redemptions"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- CreateIndex
CREATE INDEX "users_referredById_idx" ON "users"("referredById");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_points" ADD CONSTRAINT "referral_points_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_points" ADD CONSTRAINT "referral_points_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_redemptions" ADD CONSTRAINT "point_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Points can't be over-spent or go below zero, even by a bug.
ALTER TABLE "referral_points" ADD CONSTRAINT "referral_points_used_range" CHECK ("used" >= 0 AND "used" <= "points" AND "points" >= 0);
ALTER TABLE "point_redemptions" ADD CONSTRAINT "point_redemptions_points_positive" CHECK ("points" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_points_used_nonnegative" CHECK ("pointsUsed" >= 0);

-- Like every table: closed to Supabase's public data API (the app connects as the owner).
ALTER TABLE "referral_points" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "point_redemptions" ENABLE ROW LEVEL SECURITY;
