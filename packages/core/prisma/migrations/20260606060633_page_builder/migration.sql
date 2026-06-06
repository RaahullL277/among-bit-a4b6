-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "StorePage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "status" "PageStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreTheme" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#1c1917',
    "accentColor" TEXT NOT NULL DEFAULT '#4f46e5',
    "logoText" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorePage_tenantId_idx" ON "StorePage"("tenantId");

-- CreateIndex
CREATE INDEX "StorePage_storeId_status_idx" ON "StorePage"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StorePage_storeId_slug_key" ON "StorePage"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "StoreTheme_storeId_key" ON "StoreTheme"("storeId");

-- CreateIndex
CREATE INDEX "StoreTheme_tenantId_idx" ON "StoreTheme"("tenantId");

-- AddForeignKey
ALTER TABLE "StorePage" ADD CONSTRAINT "StorePage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreTheme" ADD CONSTRAINT "StoreTheme_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
