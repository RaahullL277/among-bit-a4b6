-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "metaDescription" TEXT,
ADD COLUMN     "metaTitle" TEXT;

-- CreateTable
CREATE TABLE "SeoSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "titleTemplate" TEXT NOT NULL DEFAULT '{title} | {storeName}',
    "defaultDescription" TEXT,
    "indexable" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "originalBytes" INTEGER NOT NULL,
    "optimizedBytes" INTEGER,
    "optimized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeoSettings_storeId_key" ON "SeoSettings"("storeId");

-- CreateIndex
CREATE INDEX "SeoSettings_tenantId_idx" ON "SeoSettings"("tenantId");

-- CreateIndex
CREATE INDEX "ImageAsset_tenantId_idx" ON "ImageAsset"("tenantId");

-- CreateIndex
CREATE INDEX "ImageAsset_storeId_idx" ON "ImageAsset"("storeId");

-- CreateIndex
CREATE INDEX "ImageAsset_productId_idx" ON "ImageAsset"("productId");

-- AddForeignKey
ALTER TABLE "SeoSettings" ADD CONSTRAINT "SeoSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
