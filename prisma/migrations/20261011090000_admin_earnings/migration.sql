-- Admin earnings: per-order admin share and customer reward fixed at quote time, a ledger
-- row per paid order, and settlements (payouts of pending earnings to an admin).
-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('PENDING', 'SETTLED', 'VOID');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "adminId" TEXT,
ADD COLUMN     "adminShare" DECIMAL(14,2),
ADD COLUMN     "adminSharePercent" DECIMAL(7,4),
ADD COLUMN     "reward" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "rewardPercent" DECIMAL(7,4);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "rewardPercent" DECIMAL(7,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "admin_earnings" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "margin" DECIMAL(14,2) NOT NULL,
    "sharePercent" DECIMAL(7,4) NOT NULL,
    "share" DECIMAL(14,2) NOT NULL,
    "reward" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "EarningStatus" NOT NULL DEFAULT 'PENDING',
    "settlementId" TEXT,
    "voidReason" TEXT,
    "voidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_settlements" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "count" INTEGER NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_earnings_orderId_key" ON "admin_earnings"("orderId");

-- CreateIndex
CREATE INDEX "admin_earnings_adminId_status_idx" ON "admin_earnings"("adminId", "status");

-- CreateIndex
CREATE INDEX "admin_settlements_adminId_createdAt_idx" ON "admin_settlements"("adminId", "createdAt");

-- AddForeignKey
ALTER TABLE "admin_earnings" ADD CONSTRAINT "admin_earnings_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_earnings" ADD CONSTRAINT "admin_earnings_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "admin_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_settlements" ADD CONSTRAINT "admin_settlements_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Like every table: closed to Supabase's public data API (the app connects as the owner).
ALTER TABLE "admin_earnings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_settlements" ENABLE ROW LEVEL SECURITY;
