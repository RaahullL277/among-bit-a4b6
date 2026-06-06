-- Drop the unused legal-acceptance gate; acceptance is now implicit at checkout.
ALTER TABLE "CheckoutSettings" DROP COLUMN IF EXISTS "requireLegalAcceptance";
