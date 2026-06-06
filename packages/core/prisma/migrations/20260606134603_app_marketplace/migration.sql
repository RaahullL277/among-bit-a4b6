-- AlterTable
ALTER TABLE "App" ADD COLUMN     "category" TEXT,
ADD COLUMN     "developer" TEXT,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "webhookUrl" TEXT;

-- AlterTable
ALTER TABLE "AppInstallation" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[];
