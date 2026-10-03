-- Support chat on orders: who wrote each message, and one thread row per order.
ALTER TABLE "support_messages" ADD COLUMN "authorType" TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE "support_messages" ADD COLUMN "adminId" TEXT;
CREATE INDEX "support_messages_orderId_createdAt_idx" ON "support_messages"("orderId", "createdAt");

CREATE TABLE "support_threads" (
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "lastFrom" TEXT NOT NULL,
    "userReadAt" TIMESTAMP(3),
    "adminReadAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    CONSTRAINT "support_threads_pkey" PRIMARY KEY ("orderId")
);
CREATE INDEX "support_threads_status_lastFrom_lastMessageAt_idx" ON "support_threads"("status", "lastFrom", "lastMessageAt");
CREATE INDEX "support_threads_userId_idx" ON "support_threads"("userId");
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Same as every table: closed to Supabase's public web API (see 20261002090000_row_level_security).
ALTER TABLE "support_threads" ENABLE ROW LEVEL SECURITY;

-- Existing order messages become threads; handled ones count as resolved.
INSERT INTO "support_threads" ("orderId", "userId", "status", "lastMessageAt", "lastFrom", "resolvedAt")
SELECT "orderId", min("userId"),
       CASE WHEN bool_and("handled") THEN 'RESOLVED' ELSE 'OPEN' END,
       max("createdAt"), 'USER',
       CASE WHEN bool_and("handled") THEN max("createdAt") END
FROM "support_messages" WHERE "orderId" IS NOT NULL GROUP BY "orderId";

-- Customers' phones and browsers for push notifications (chat replies).
CREATE TABLE "push_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");
CREATE INDEX "push_devices_userId_idx" ON "push_devices"("userId");
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_devices" ENABLE ROW LEVEL SECURITY;
