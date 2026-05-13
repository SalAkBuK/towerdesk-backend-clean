CREATE TABLE "UnitOwnership" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isPrimary" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitOwnership_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UnitOwnership_orgId_ownerId_startDate_endDate_idx"
  ON "UnitOwnership"("orgId", "ownerId", "startDate", "endDate");
CREATE INDEX "UnitOwnership_orgId_unitId_startDate_endDate_idx"
  ON "UnitOwnership"("orgId", "unitId", "startDate", "endDate");
CREATE INDEX "UnitOwnership_unitId_endDate_idx"
  ON "UnitOwnership"("unitId", "endDate");
CREATE UNIQUE INDEX "UnitOwnership_active_unit_unique"
  ON "UnitOwnership"("unitId")
  WHERE "endDate" IS NULL;

INSERT INTO "UnitOwnership" (
  "id",
  "orgId",
  "unitId",
  "ownerId",
  "startDate",
  "endDate",
  "isPrimary",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  building."orgId",
  unit."id",
  unit."ownerId",
  CURRENT_TIMESTAMP,
  NULL,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Unit" unit
JOIN "Building" building ON building."id" = unit."buildingId"
WHERE unit."ownerId" IS NOT NULL;

ALTER TABLE "UnitOwnership" ADD CONSTRAINT "UnitOwnership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitOwnership" ADD CONSTRAINT "UnitOwnership_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitOwnership" ADD CONSTRAINT "UnitOwnership_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
