-- CreateEnum
CREATE TYPE "EngagementTrigger" AS ENUM ('NEW_IN_STOCK', 'BEST_SELLING', 'SLOW_MOVING', 'LOW_STOCK', 'BACK_IN_STOCK', 'DISCOUNT', 'FESTIVE_DISCOUNT', 'ABANDONED_CART', 'COHORT_OFFER');

-- CreateEnum
CREATE TYPE "EngagementSendStatus" AS ENUM ('SENT', 'SUPPRESSED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "EngagementCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "trigger" "EngagementTrigger" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "templateKey" TEXT,
    "temperatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cohortKey" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngagementCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hotMaxPer7Days" INTEGER NOT NULL DEFAULT 4,
    "warmMaxPer7Days" INTEGER NOT NULL DEFAULT 2,
    "coldMaxPer7Days" INTEGER NOT NULL DEFAULT 1,
    "perCustomerDailyCap" INTEGER NOT NULL DEFAULT 1,
    "minHoursBetween" INTEGER NOT NULL DEFAULT 20,
    "quietStartHour" INTEGER NOT NULL DEFAULT 21,
    "quietEndHour" INTEGER NOT NULL DEFAULT 8,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngagementPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "trigger" "EngagementTrigger" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "templateKey" TEXT NOT NULL,
    "temperature" TEXT,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "EngagementSendStatus" NOT NULL,
    "reason" TEXT,
    "providerRef" TEXT,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngagementCampaign_tenantId_idx" ON "EngagementCampaign"("tenantId");

-- CreateIndex
CREATE INDEX "EngagementCampaign_storeId_enabled_idx" ON "EngagementCampaign"("storeId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementCampaign_storeId_trigger_channel_key" ON "EngagementCampaign"("storeId", "trigger", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementPolicy_storeId_key" ON "EngagementPolicy"("storeId");

-- CreateIndex
CREATE INDEX "EngagementMessage_tenantId_idx" ON "EngagementMessage"("tenantId");

-- CreateIndex
CREATE INDEX "EngagementMessage_storeId_status_createdAt_idx" ON "EngagementMessage"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EngagementMessage_customerId_createdAt_idx" ON "EngagementMessage"("customerId", "createdAt");
