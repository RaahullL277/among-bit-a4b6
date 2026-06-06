-- CreateEnum
CREATE TYPE "AgentChannel" AS ENUM ('CLAUDE', 'CHATGPT', 'GEMINI', 'PERPLEXITY', 'COPILOT', 'META_AI');

-- CreateTable
CREATE TABLE "ShopabilityConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabledChannels" "AgentChannel"[] DEFAULT ARRAY['CLAUDE', 'CHATGPT', 'GEMINI', 'PERPLEXITY', 'COPILOT', 'META_AI']::"AgentChannel"[],
    "agentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopabilityConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopabilityConfig_storeId_key" ON "ShopabilityConfig"("storeId");

-- CreateIndex
CREATE INDEX "ShopabilityConfig_tenantId_idx" ON "ShopabilityConfig"("tenantId");
