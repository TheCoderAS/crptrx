-- Support staff's browsers for push notifications (customer chat messages).
CREATE TABLE "admin_push_devices" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_push_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_push_devices_token_key" ON "admin_push_devices"("token");
CREATE INDEX "admin_push_devices_adminId_idx" ON "admin_push_devices"("adminId");
ALTER TABLE "admin_push_devices" ADD CONSTRAINT "admin_push_devices_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Same as every table: closed to Supabase's public web API.
ALTER TABLE "admin_push_devices" ENABLE ROW LEVEL SECURITY;
