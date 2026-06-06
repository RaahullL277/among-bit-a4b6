-- AlterTable
ALTER TABLE "StockPolicy" ADD COLUMN     "allowBackorder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trackInventory" BOOLEAN NOT NULL DEFAULT true;
