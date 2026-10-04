-- Admin invite codes and profit share; customers tagged to the admin whose code they used.
ALTER TABLE "admins" ADD COLUMN "inviteCode" TEXT,
ADD COLUMN "profitPercent" DECIMAL(7,4) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "admins_inviteCode_key" ON "admins"("inviteCode");

ALTER TABLE "users" ADD COLUMN "adminId" TEXT,
ADD COLUMN "referredAt" TIMESTAMP(3);
CREATE INDEX "users_adminId_idx" ON "users"("adminId");
ALTER TABLE "users" ADD CONSTRAINT "users_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
