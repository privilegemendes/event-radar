-- Rename the VIEWER role to MEMBER.
--
-- Written by hand: `prisma migrate diff` renders an enum value change as a
-- drop-and-recreate of the type, which would have to rewrite every row that
-- references it. Postgres can rename a value in place, which preserves the
-- existing data and needs no backfill.
ALTER TYPE "Role" RENAME VALUE 'VIEWER' TO 'MEMBER';

-- The column default still names the old value until it is re-stated.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
