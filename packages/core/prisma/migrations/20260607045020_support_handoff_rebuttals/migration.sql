-- AlterTable
ALTER TABLE "SupportBotConfig" ADD COLUMN     "humanHandoffEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxRebuttals" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "supportEmail" TEXT,
ADD COLUMN     "supportPhone" TEXT;

-- AlterTable
ALTER TABLE "SupportConversation" ADD COLUMN     "rebuttals" INTEGER NOT NULL DEFAULT 0;

