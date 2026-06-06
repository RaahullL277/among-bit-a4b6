-- AlterTable
ALTER TABLE "CheckoutSettings" ADD COLUMN     "requireLegalAcceptance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "sourceRef" TEXT;

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT,
    "email" TEXT,
    "ip" TEXT,
    "policies" JSONB NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalAcceptance_tenantId_idx" ON "LegalAcceptance"("tenantId");

-- CreateIndex
CREATE INDEX "LegalAcceptance_storeId_acceptedAt_idx" ON "LegalAcceptance"("storeId", "acceptedAt");

-- CreateIndex
CREATE INDEX "LegalAcceptance_orderId_idx" ON "LegalAcceptance"("orderId");

-- CreateIndex
CREATE INDEX "Order_storeId_sourceRef_idx" ON "Order"("storeId", "sourceRef");

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
