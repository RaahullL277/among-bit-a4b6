-- CreateEnum
CREATE TYPE "ExperimentMode" AS ENUM ('SPLIT', 'TARGETED');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "AudienceKind" AS ENUM ('ALL', 'COHORT', 'ACQUISITION_SOURCE', 'ACQUISITION_CAMPAIGN');

-- AlterTable
ALTER TABLE "BehaviorEvent" ADD COLUMN     "experimentId" TEXT,
ADD COLUMN     "experimentVariantId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "experimentId" TEXT,
ADD COLUMN     "experimentVariantId" TEXT;

-- CreateTable
CREATE TABLE "StoreExperiment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "ExperimentMode" NOT NULL DEFAULT 'SPLIT',
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "winningVariantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentVariant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "themeOverride" JSONB,
    "audienceKind" "AudienceKind" NOT NULL DEFAULT 'ALL',
    "audienceValue" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperimentVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreExperiment_tenantId_idx" ON "StoreExperiment"("tenantId");

-- CreateIndex
CREATE INDEX "StoreExperiment_storeId_status_idx" ON "StoreExperiment"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StoreExperiment_storeId_slug_key" ON "StoreExperiment"("storeId", "slug");

-- CreateIndex
CREATE INDEX "ExperimentVariant_experimentId_idx" ON "ExperimentVariant"("experimentId");

-- CreateIndex
CREATE INDEX "ExperimentVariant_tenantId_idx" ON "ExperimentVariant"("tenantId");

-- AddForeignKey
ALTER TABLE "StoreExperiment" ADD CONSTRAINT "StoreExperiment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentVariant" ADD CONSTRAINT "ExperimentVariant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "StoreExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

