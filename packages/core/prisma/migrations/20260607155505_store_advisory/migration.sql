-- AlterEnum
ALTER TYPE "NotificationEvent" ADD VALUE 'STORE_ADVISORY';

-- CreateTable
CREATE TABLE "AdvisoryDispatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvisoryDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvisoryDispatch_tenantId_idx" ON "AdvisoryDispatch"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisoryDispatch_storeId_code_key" ON "AdvisoryDispatch"("storeId", "code");

