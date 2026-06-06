-- CreateEnum
CREATE TYPE "LegalPolicyType" AS ENUM ('TERMS', 'PRIVACY', 'SHIPPING', 'REFUND', 'COOKIES');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('SHOPIFY', 'WOOCOMMERCE', 'DUKAAN', 'GENERIC');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "LegalPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "LegalPolicyType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "PageStatus" NOT NULL DEFAULT 'DRAFT',
    "generated" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "productsCreated" INTEGER NOT NULL DEFAULT 0,
    "productsSkipped" INTEGER NOT NULL DEFAULT 0,
    "customersCreated" INTEGER NOT NULL DEFAULT 0,
    "customersSkipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalPolicy_tenantId_idx" ON "LegalPolicy"("tenantId");

-- CreateIndex
CREATE INDEX "LegalPolicy_storeId_status_idx" ON "LegalPolicy"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LegalPolicy_storeId_type_key" ON "LegalPolicy"("storeId", "type");

-- CreateIndex
CREATE INDEX "ImportJob_tenantId_idx" ON "ImportJob"("tenantId");

-- CreateIndex
CREATE INDEX "ImportJob_storeId_createdAt_idx" ON "ImportJob"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "LegalPolicy" ADD CONSTRAINT "LegalPolicy_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
