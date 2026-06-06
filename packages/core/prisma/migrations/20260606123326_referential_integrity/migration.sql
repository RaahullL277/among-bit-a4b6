-- Backfill referential integrity: remove/neutralise rows orphaned before these
-- models had foreign keys, so the constraints below can be added safely.
DELETE FROM "BehaviorEvent" WHERE "storeId" NOT IN (SELECT "id" FROM "Store");
UPDATE "BehaviorEvent" SET "customerId" = NULL WHERE "customerId" IS NOT NULL AND "customerId" NOT IN (SELECT "id" FROM "Customer");
DELETE FROM "CohortMembership" WHERE "customerId" NOT IN (SELECT "id" FROM "Customer");
DELETE FROM "Cohort" WHERE "storeId" NOT IN (SELECT "id" FROM "Store");
DELETE FROM "EngagementCampaign" WHERE "storeId" NOT IN (SELECT "id" FROM "Store");
DELETE FROM "EngagementPolicy" WHERE "storeId" NOT IN (SELECT "id" FROM "Store");
DELETE FROM "ShopabilityConfig" WHERE "storeId" NOT IN (SELECT "id" FROM "Store");
DELETE FROM "EngagementMessage" WHERE "storeId" NOT IN (SELECT "id" FROM "Store");
UPDATE "EngagementMessage" SET "customerId" = NULL WHERE "customerId" IS NOT NULL AND "customerId" NOT IN (SELECT "id" FROM "Customer");

-- AddForeignKey
ALTER TABLE "BehaviorEvent" ADD CONSTRAINT "BehaviorEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviorEvent" ADD CONSTRAINT "BehaviorEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortMembership" ADD CONSTRAINT "CohortMembership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementCampaign" ADD CONSTRAINT "EngagementCampaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementPolicy" ADD CONSTRAINT "EngagementPolicy_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopabilityConfig" ADD CONSTRAINT "ShopabilityConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementMessage" ADD CONSTRAINT "EngagementMessage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementMessage" ADD CONSTRAINT "EngagementMessage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
