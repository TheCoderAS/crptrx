-- CreateTable
CREATE TABLE "rate_feed_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastOkAt" TIMESTAMP(3),
    "lastMarket" DECIMAL(14,4),
    "baselineMarket" DECIMAL(14,4),
    "sources" JSONB,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "failingSince" TIMESTAMP(3),
    "alertSentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_feed_state_pkey" PRIMARY KEY ("id")
);
