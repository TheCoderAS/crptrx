-- Admins ask the super admin to pay out what they're owed. One open request per admin.
-- CreateEnum
CREATE TYPE "PayoutRequestStatus" AS ENUM ('OPEN', 'PAID', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "admin_payout_requests" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "status" "PayoutRequestStatus" NOT NULL DEFAULT 'OPEN',
    "settlementId" TEXT,
    "reason" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_payout_requests_settlementId_key" ON "admin_payout_requests"("settlementId");

-- CreateIndex
CREATE INDEX "admin_payout_requests_status_createdAt_idx" ON "admin_payout_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "admin_payout_requests_adminId_createdAt_idx" ON "admin_payout_requests"("adminId", "createdAt");

-- AddForeignKey
ALTER TABLE "admin_payout_requests" ADD CONSTRAINT "admin_payout_requests_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_payout_requests" ADD CONSTRAINT "admin_payout_requests_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "admin_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most one waiting request per admin.
CREATE UNIQUE INDEX "admin_payout_requests_one_open" ON "admin_payout_requests" ("adminId") WHERE "status" = 'OPEN';

-- Like every table: closed to Supabase's public data API (the app connects as the owner).
ALTER TABLE "admin_payout_requests" ENABLE ROW LEVEL SECURITY;
