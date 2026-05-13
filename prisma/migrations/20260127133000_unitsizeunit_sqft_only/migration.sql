-- Normalize existing data to SQ_FT
UPDATE "Unit"
SET "unitSizeUnit" = 'SQ_FT'
WHERE "unitSizeUnit" IS NULL OR "unitSizeUnit" = 'SQ_M';

-- Replace enum type to remove SQ_M
BEGIN;

CREATE TYPE "UnitSizeUnit_new" AS ENUM ('SQ_FT');

ALTER TABLE "Unit"
  ALTER COLUMN "unitSizeUnit" TYPE "UnitSizeUnit_new"
  USING ("unitSizeUnit"::text::"UnitSizeUnit_new");

ALTER TABLE "Unit"
  ALTER COLUMN "unitSizeUnit" SET DEFAULT 'SQ_FT',
  ALTER COLUMN "unitSizeUnit" SET NOT NULL;

DROP TYPE "UnitSizeUnit";
ALTER TYPE "UnitSizeUnit_new" RENAME TO "UnitSizeUnit";

COMMIT;

