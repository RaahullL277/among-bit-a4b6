-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingConsentAt" TIMESTAMP(3),
ADD COLUMN     "unsubscribedAt" TIMESTAMP(3);
