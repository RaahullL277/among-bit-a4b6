-- CreateEnum
CREATE TYPE "SupportConversationStatus" AS ENUM ('OPEN', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SupportSender" AS ENUM ('CUSTOMER', 'BOT', 'AGENT');

-- CreateTable
CREATE TABLE "SupportBotConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayName" TEXT NOT NULL DEFAULT 'Assistant',
    "greeting" TEXT,
    "persona" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportBotConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "status" "SupportConversationStatus" NOT NULL DEFAULT 'OPEN',
    "escalationReason" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" "SupportSender" NOT NULL,
    "body" TEXT NOT NULL,
    "toolsUsed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportBotConfig_storeId_key" ON "SupportBotConfig"("storeId");

-- CreateIndex
CREATE INDEX "SupportBotConfig_tenantId_idx" ON "SupportBotConfig"("tenantId");

-- CreateIndex
CREATE INDEX "SupportConversation_tenantId_idx" ON "SupportConversation"("tenantId");

-- CreateIndex
CREATE INDEX "SupportConversation_storeId_idx" ON "SupportConversation"("storeId");

-- CreateIndex
CREATE INDEX "SupportConversation_status_idx" ON "SupportConversation"("status");

-- CreateIndex
CREATE INDEX "SupportMessage_conversationId_idx" ON "SupportMessage"("conversationId");

-- AddForeignKey
ALTER TABLE "SupportBotConfig" ADD CONSTRAINT "SupportBotConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
