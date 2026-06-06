-- CreateTable
CREATE TABLE "AgentCheckout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "orderId" TEXT,
    "channel" "AgentChannel",
    "mandateRef" TEXT NOT NULL,
    "maxAmountMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentCheckout_tenantId_idx" ON "AgentCheckout"("tenantId");

-- CreateIndex
CREATE INDEX "AgentCheckout_storeId_createdAt_idx" ON "AgentCheckout"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentCheckout" ADD CONSTRAINT "AgentCheckout_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
