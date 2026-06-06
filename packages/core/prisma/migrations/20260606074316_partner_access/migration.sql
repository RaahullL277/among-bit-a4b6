-- CreateEnum
CREATE TYPE "PartnerAccessLevel" AS ENUM ('MANAGE', 'VIEW', 'NONE');

-- AlterTable
ALTER TABLE "PartnerClient" ADD COLUMN     "accessLevel" "PartnerAccessLevel" NOT NULL DEFAULT 'MANAGE';
