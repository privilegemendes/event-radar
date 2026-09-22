-- Add five columns that exist in schema.prisma, and in the hosted database, but
-- that no migration ever created — they were applied directly (prisma db push)
-- and the history was never caught up.
--
-- The effect was silent until now because the hosted database already had them.
-- Any *new* environment built from migrations got a schema the application code
-- expects columns from: seeding fails on Partner.region, and reads of
-- Event.city / ownerOnly / attendUrl would error at runtime.
--
-- IF NOT EXISTS so this is correct in both directions: it creates the columns on
-- a fresh database, and is a no-op on the hosted one where they already exist.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "attendUrl" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "ownerOnly" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "tier" TEXT;
