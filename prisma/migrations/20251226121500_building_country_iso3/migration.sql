-- Align country default with ISO-3
ALTER TABLE "Building" ALTER COLUMN "country" SET DEFAULT 'ARE';

-- Update UAE default rows to ISO-3
UPDATE "Building" SET "country" = 'ARE' WHERE "country" = 'AE';
