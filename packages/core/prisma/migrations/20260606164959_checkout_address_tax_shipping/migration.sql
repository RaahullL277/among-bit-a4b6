-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "email" TEXT,
ADD COLUMN     "shippingAddress" JSONB,
ADD COLUMN     "shippingMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CheckoutSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "taxBps" INTEGER NOT NULL DEFAULT 0,
    "taxLabel" TEXT NOT NULL DEFAULT 'Tax',
    "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false,
    "flatShippingMinor" INTEGER NOT NULL DEFAULT 0,
    "freeShippingOverMinor" INTEGER,
    "requireAddress" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSettings_storeId_key" ON "CheckoutSettings"("storeId");

-- AddForeignKey
ALTER TABLE "CheckoutSettings" ADD CONSTRAINT "CheckoutSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
