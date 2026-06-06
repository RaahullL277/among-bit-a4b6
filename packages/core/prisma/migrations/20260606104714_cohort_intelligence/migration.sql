-- CreateEnum
CREATE TYPE "BehaviorEventType" AS ENUM ('LAND', 'VIEW', 'CLICK', 'ADD_TO_CART', 'PURCHASE');

-- CreateEnum
CREATE TYPE "CohortKind" AS ENUM ('BEHAVIORAL', 'ACQUISITION');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "acqCampaign" TEXT,
ADD COLUMN     "acqSource" TEXT,
ADD COLUMN     "acqTerm" TEXT;

-- CreateTable
CREATE TABLE "BehaviorEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "anonymousId" TEXT,
    "type" "BehaviorEventType" NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "term" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BehaviorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cohort" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" "CohortKind" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "signature" JSONB NOT NULL DEFAULT '{}',
    "size" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "CohortMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BehaviorEvent_tenantId_idx" ON "BehaviorEvent"("tenantId");

-- CreateIndex
CREATE INDEX "BehaviorEvent_storeId_type_idx" ON "BehaviorEvent"("storeId", "type");

-- CreateIndex
CREATE INDEX "BehaviorEvent_customerId_idx" ON "BehaviorEvent"("customerId");

-- CreateIndex
CREATE INDEX "BehaviorEvent_anonymousId_idx" ON "BehaviorEvent"("anonymousId");

-- CreateIndex
CREATE INDEX "Cohort_tenantId_idx" ON "Cohort"("tenantId");

-- CreateIndex
CREATE INDEX "Cohort_storeId_idx" ON "Cohort"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Cohort_storeId_key_key" ON "Cohort"("storeId", "key");

-- CreateIndex
CREATE INDEX "CohortMembership_customerId_idx" ON "CohortMembership"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CohortMembership_cohortId_customerId_key" ON "CohortMembership"("cohortId", "customerId");

-- AddForeignKey
ALTER TABLE "CohortMembership" ADD CONSTRAINT "CohortMembership_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
