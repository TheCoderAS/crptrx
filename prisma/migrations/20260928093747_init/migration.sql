-- CreateEnum
CREATE TYPE "Network" AS ENUM ('TRON', 'BSC');

-- CreateEnum
CREATE TYPE "NetworkMode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'APPROVED', 'NEEDS_CHANGES', 'DECLINED');

-- CreateEnum
CREATE TYPE "PayoutType" AS ENUM ('BANK', 'UPI');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('QUOTE_READY', 'EXPIRED', 'PAYMENT_SUBMITTED', 'PAYMENT_CONFIRMED', 'UNDER_REVIEW', 'ON_HOLD', 'APPROVED', 'PAID', 'CLOSED_MANUAL');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'MANUAL_HANDLING', 'IGNORED_WRONG_TOKEN');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "firebaseUid" TEXT,
    "mobile" TEXT,
    "mobileVerifiedAt" TIMESTAMP(3),
    "displayName" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dob" TEXT NOT NULL,
    "panEncrypted" TEXT NOT NULL,
    "panMasked" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "panDocKey" TEXT NOT NULL,
    "aadhaarFrontKey" TEXT NOT NULL,
    "aadhaarBackKey" TEXT NOT NULL,
    "selfieKey" TEXT NOT NULL,
    "maskedConfirmed" BOOLEAN NOT NULL,
    "status" "KycStatus" NOT NULL,
    "reviewerId" TEXT,
    "reason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_methods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PayoutType" NOT NULL,
    "holderName" TEXT NOT NULL,
    "accountNumberEncrypted" TEXT,
    "accountLast4" TEXT,
    "ifsc" TEXT,
    "upiId" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reason" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payout_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "network" "Network" NOT NULL,
    "networkMode" "NetworkMode" NOT NULL,
    "depositAddress" TEXT NOT NULL,
    "tokenContract" TEXT NOT NULL,
    "usdtAmount" DECIMAL(38,18) NOT NULL,
    "rate" DECIMAL(14,4) NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "taxPercent" DECIMAL(7,4) NOT NULL,
    "taxHeld" DECIMAL(14,2) NOT NULL,
    "feePercent" DECIMAL(7,4) NOT NULL,
    "fee" DECIMAL(14,2) NOT NULL,
    "gstPercent" DECIMAL(7,4) NOT NULL,
    "gstOnFee" DECIMAL(14,2) NOT NULL,
    "net" DECIMAL(14,2) NOT NULL,
    "payoutMethodId" TEXT NOT NULL,
    "payoutSnapshot" JSONB NOT NULL,
    "quoteExpiresAt" TIMESTAMP(3) NOT NULL,
    "submittedTxid" TEXT,
    "txid" TEXT,
    "transferPosition" INTEGER,
    "senderAddress" TEXT,
    "receivedAmount" DECIMAL(38,18),
    "confirmedAt" TIMESTAMP(3),
    "holdReason" TEXT,
    "holdMessage" TEXT,
    "walletCheckResult" TEXT,
    "walletCheckNote" TEXT,
    "walletCheckedBy" TEXT,
    "utr" TEXT,
    "paidAmount" DECIMAL(14,2),
    "paidAt" TIMESTAMP(3),
    "paidByAdminId" TEXT,
    "resolutionNote" TEXT,
    "returnTxid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incoming_transfers" (
    "id" TEXT NOT NULL,
    "network" "Network" NOT NULL,
    "txid" TEXT NOT NULL,
    "transferPosition" INTEGER NOT NULL,
    "tokenContract" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "rawAmount" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedOrderId" TEXT,
    "handlingNote" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incoming_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watcher_state" (
    "network" "Network" NOT NULL,
    "cursor" JSONB NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "failingSince" TIMESTAMP(3),
    "alertSentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watcher_state_pkey" PRIMARY KEY ("network")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "publicMessage" TEXT,
    "privateNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notes" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attachmentKey" TEXT,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "settings_history" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB NOT NULL,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_address_changes" (
    "id" TEXT NOT NULL,
    "network" "Network" NOT NULL,
    "networkMode" "NetworkMode" NOT NULL,
    "newAddress" TEXT NOT NULL,
    "oldAddress" TEXT,
    "requestedBy" TEXT NOT NULL,
    "cancelTokenHash" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_address_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "totpSecretEncrypted" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastTotpStep" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'FULL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_firebaseUid_key" ON "users"("firebaseUid");

-- CreateIndex
CREATE INDEX "kyc_submissions_status_submittedAt_idx" ON "kyc_submissions"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "payout_methods_status_createdAt_idx" ON "payout_methods"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "orders_seq_key" ON "orders"("seq");

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_network_depositAddress_usdtAmount_status_idx" ON "orders"("network", "depositAddress", "usdtAmount", "status");

-- CreateIndex
CREATE INDEX "orders_userId_createdAt_idx" ON "orders"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "orders_network_txid_transferPosition_key" ON "orders"("network", "txid", "transferPosition");

-- CreateIndex
CREATE INDEX "incoming_transfers_status_idx" ON "incoming_transfers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "incoming_transfers_network_txid_transferPosition_key" ON "incoming_transfers"("network", "txid", "transferPosition");

-- CreateIndex
CREATE INDEX "order_events_orderId_createdAt_idx" ON "order_events"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "settings_history_key_createdAt_idx" ON "settings_history"("key", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_address_changes_cancelTokenHash_key" ON "deposit_address_changes"("cancelTokenHash");

-- CreateIndex
CREATE INDEX "deposit_address_changes_network_networkMode_effectiveAt_idx" ON "deposit_address_changes"("network", "networkMode", "effectiveAt");

-- CreateIndex
CREATE INDEX "audit_log_action_createdAt_idx" ON "audit_log"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "sessions_subjectType_subjectId_idx" ON "sessions"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "otp_codes_userId_createdAt_idx" ON "otp_codes"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "outbound_messages_createdAt_idx" ON "outbound_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_methods" ADD CONSTRAINT "payout_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_methods" ADD CONSTRAINT "payout_methods_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_transfers" ADD CONSTRAINT "incoming_transfers_matchedOrderId_fkey" FOREIGN KEY ("matchedOrderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written additions (not expressible in schema.prisma)
-- ---------------------------------------------------------------------------

-- Unique amounts: no two OPEN orders on the same network + deposit address may
-- share an exact USDT amount (spec 7.2). The app also checks this under a lock;
-- this index is the last line of defence against races.
CREATE UNIQUE INDEX "orders_open_amount_unique"
  ON "orders" ("network", "depositAddress", "usdtAmount")
  WHERE "status" IN ('QUOTE_READY', 'PAYMENT_SUBMITTED');

-- A submitted TxID may be claimed by one order only (spec 13 test list).
CREATE UNIQUE INDEX "orders_submitted_txid_unique"
  ON "orders" (lower("submittedTxid"))
  WHERE "submittedTxid" IS NOT NULL;

-- History tables are append-only (spec 9). Any UPDATE or DELETE raises.
CREATE OR REPLACE FUNCTION forbid_history_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_events_append_only
  BEFORE UPDATE OR DELETE ON "order_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
CREATE TRIGGER settings_history_append_only
  BEFORE UPDATE OR DELETE ON "settings_history"
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();
-- TRUNCATE bypasses row triggers, so block it too.
CREATE TRIGGER order_events_no_truncate BEFORE TRUNCATE ON "order_events"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
CREATE TRIGGER settings_history_no_truncate BEFORE TRUNCATE ON "settings_history"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();
