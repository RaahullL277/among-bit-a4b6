-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "compareAtMinor" INTEGER;

-- CreateTable
CREATE TABLE "ListingAgentConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "masterPrompt" TEXT,
    "brandVoice" TEXT,
    "tone" TEXT,
    "categoryHint" TEXT,
    "contentRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "descWords" INTEGER NOT NULL DEFAULT 60,
    "enhanceBackground" BOOLEAN NOT NULL DEFAULT true,
    "squareCrop" BOOLEAN NOT NULL DEFAULT true,
    "autoAltText" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingAgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListingAgentConfig_storeId_key" ON "ListingAgentConfig"("storeId");

-- AddForeignKey
ALTER TABLE "ListingAgentConfig" ADD CONSTRAINT "ListingAgentConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
