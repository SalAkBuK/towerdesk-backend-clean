-- 1) Only one ACTIVE occupancy per unit
CREATE UNIQUE INDEX "uniq_active_occupancy_per_unit"
ON "Occupancy" ("unitId")
WHERE "status" = 'ACTIVE';

-- 2) Only one ACTIVE occupancy per resident
CREATE UNIQUE INDEX "uniq_active_occupancy_per_resident"
ON "Occupancy" ("residentUserId")
WHERE "status" = 'ACTIVE';

-- 3) Keep status and endAt consistent
ALTER TABLE "Occupancy"
ADD CONSTRAINT "occupancy_status_endat_consistency"
CHECK (
  ("status" = 'ACTIVE' AND "endAt" IS NULL)
  OR
  ("status" = 'ENDED' AND "endAt" IS NOT NULL)
);
