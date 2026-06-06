-- AlterEnum
ALTER TYPE "BehaviorEventType" ADD VALUE 'SEARCH';

-- AlterEnum
ALTER TYPE "CohortKind" ADD VALUE 'SEARCH_INTENT';

-- AlterTable
ALTER TABLE "BehaviorEvent" ADD COLUMN     "query" TEXT;
