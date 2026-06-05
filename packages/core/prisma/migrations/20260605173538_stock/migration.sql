-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('GREEN', 'AMBER', 'RED');

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "lastStockStatus" "StockStatus";

-- CreateTable
CREATE TABLE "StockPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "greenDays" INTEGER NOT NULL DEFAULT 14,
    "amberDays" INTEGER NOT NULL DEFAULT 5,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "velocityWindowDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockPolicy_storeId_key" ON "StockPolicy"("storeId");

-- CreateIndex
CREATE INDEX "StockPolicy_tenantId_idx" ON "StockPolicy"("tenantId");

-- AddForeignKey
ALTER TABLE "StockPolicy" ADD CONSTRAINT "StockPolicy_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
