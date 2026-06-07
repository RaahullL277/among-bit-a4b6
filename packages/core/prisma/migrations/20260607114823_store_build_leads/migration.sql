-- CreateEnum
CREATE TYPE "StoreBuildSource" AS ENUM ('MERCHANT', 'PARTNER');

-- CreateEnum
CREATE TYPE "StoreBuildStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "StoreBuildLead" (
    "id" TEXT NOT NULL,
    "source" "StoreBuildSource" NOT NULL DEFAULT 'MERCHANT',
    "status" "StoreBuildStatus" NOT NULL DEFAULT 'NEW',
    "email" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "businessName" TEXT,
    "assets" JSONB NOT NULL DEFAULT '[]',
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreBuildLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreBuildLead_source_status_idx" ON "StoreBuildLead"("source", "status");

-- CreateIndex
CREATE INDEX "StoreBuildLead_email_idx" ON "StoreBuildLead"("email");

