-- AlterTable
ALTER TABLE "Building" ADD COLUMN "city" TEXT;
ALTER TABLE "Building" ADD COLUMN "emirate" TEXT;
ALTER TABLE "Building" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'AE';
ALTER TABLE "Building" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai';
ALTER TABLE "Building" ADD COLUMN "floors" INTEGER;
ALTER TABLE "Building" ADD COLUMN "unitsCount" INTEGER;

-- Backfill and enforce required city
UPDATE "Building" SET "city" = 'Unknown' WHERE "city" IS NULL;
ALTER TABLE "Building" ALTER COLUMN "city" SET NOT NULL;
