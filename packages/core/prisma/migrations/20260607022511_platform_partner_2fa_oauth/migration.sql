-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "twoFactorEnabledAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorSecret" TEXT;

-- AlterTable
ALTER TABLE "PlatformUser" ADD COLUMN     "twoFactorEnabledAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorSecret" TEXT;

-- CreateTable
CREATE TABLE "PlatformOAuthIdentity" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformOAuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformTwoFactorChallenge" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformTwoFactorChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerOAuthIdentity" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerOAuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerTwoFactorChallenge" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerTwoFactorChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformOAuthIdentity_platformUserId_idx" ON "PlatformOAuthIdentity"("platformUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformOAuthIdentity_provider_providerUserId_key" ON "PlatformOAuthIdentity"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformTwoFactorChallenge_tokenHash_key" ON "PlatformTwoFactorChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "PlatformTwoFactorChallenge_platformUserId_idx" ON "PlatformTwoFactorChallenge"("platformUserId");

-- CreateIndex
CREATE INDEX "PartnerOAuthIdentity_partnerId_idx" ON "PartnerOAuthIdentity"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOAuthIdentity_provider_providerUserId_key" ON "PartnerOAuthIdentity"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerTwoFactorChallenge_tokenHash_key" ON "PartnerTwoFactorChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "PartnerTwoFactorChallenge_partnerId_idx" ON "PartnerTwoFactorChallenge"("partnerId");

-- AddForeignKey
ALTER TABLE "PlatformOAuthIdentity" ADD CONSTRAINT "PlatformOAuthIdentity_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTwoFactorChallenge" ADD CONSTRAINT "PlatformTwoFactorChallenge_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOAuthIdentity" ADD CONSTRAINT "PartnerOAuthIdentity_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTwoFactorChallenge" ADD CONSTRAINT "PartnerTwoFactorChallenge_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

