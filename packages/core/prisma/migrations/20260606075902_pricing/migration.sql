-- CreateEnum
CREATE TYPE "RepricingStrategy" AS ENUM ('MATCH_LOWEST', 'BEAT_LOWEST', 'FIXED_MARGIN');

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "costMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CompetitorPrice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "competitorName" TEXT NOT NULL,
    "url" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "strategy" "RepricingStrategy" NOT NULL DEFAULT 'BEAT_LOWEST',
    "adjustValue" INTEGER NOT NULL DEFAULT 1,
    "adjustIsPercent" BOOLEAN NOT NULL DEFAULT true,
    "minMarginPercent" INTEGER NOT NULL DEFAULT 10,
    "roundTo99" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitorPrice_tenantId_idx" ON "CompetitorPrice"("tenantId");

-- CreateIndex
CREATE INDEX "CompetitorPrice_storeId_idx" ON "CompetitorPrice"("storeId");

-- CreateIndex
CREATE INDEX "CompetitorPrice_variantId_idx" ON "CompetitorPrice"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_storeId_key" ON "PricingRule"("storeId");

-- CreateIndex
CREATE INDEX "PricingRule_tenantId_idx" ON "PricingRule"("tenantId");

-- AddForeignKey
ALTER TABLE "CompetitorPrice" ADD CONSTRAINT "CompetitorPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
