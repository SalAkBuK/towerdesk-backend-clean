ALTER TABLE "MaintenanceRequest"
ADD COLUMN "occupancyIdAtCreation" TEXT;

ALTER TABLE "MaintenanceRequest"
ADD CONSTRAINT "MaintenanceRequest_occupancyIdAtCreation_fkey"
FOREIGN KEY ("occupancyIdAtCreation") REFERENCES "Occupancy"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MaintenanceRequest_occupancyIdAtCreation_idx"
ON "MaintenanceRequest"("occupancyIdAtCreation");
