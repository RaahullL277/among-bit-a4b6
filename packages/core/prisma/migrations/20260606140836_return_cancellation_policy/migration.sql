-- CreateTable
CREATE TABLE "ReturnPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "returnWindowDays" INTEGER NOT NULL DEFAULT 30,
    "eligibleReasons" "ReturnReason"[] DEFAULT ARRAY['DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'NO_LONGER_NEEDED', 'OTHER']::"ReturnReason"[],
    "restockingFeePercent" INTEGER NOT NULL DEFAULT 0,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "cancelEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cancelWindowHours" INTEGER NOT NULL DEFAULT 24,
    "allowCancelAfterShipment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReturnPolicy_storeId_key" ON "ReturnPolicy"("storeId");

-- AddForeignKey
ALTER TABLE "ReturnPolicy" ADD CONSTRAINT "ReturnPolicy_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
