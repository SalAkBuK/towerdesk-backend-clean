CREATE TYPE "MaintenanceRequestEstimateStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'SUBMITTED');

ALTER TABLE "MaintenanceRequest"
ADD COLUMN "estimateStatus" "MaintenanceRequestEstimateStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN "estimateRequestedAt" TIMESTAMP(3),
ADD COLUMN "estimateRequestedByUserId" TEXT,
ADD COLUMN "estimateSubmittedAt" TIMESTAMP(3),
ADD COLUMN "estimateSubmittedByUserId" TEXT;

CREATE INDEX "MaintenanceRequest_estimateStatus_idx"
ON "MaintenanceRequest"("estimateStatus");

CREATE INDEX "MaintenanceRequest_estimateRequestedByUserId_idx"
ON "MaintenanceRequest"("estimateRequestedByUserId");

CREATE INDEX "MaintenanceRequest_estimateSubmittedByUserId_idx"
ON "MaintenanceRequest"("estimateSubmittedByUserId");

ALTER TABLE "MaintenanceRequest"
ADD CONSTRAINT "MaintenanceRequest_estimateRequestedByUserId_fkey"
FOREIGN KEY ("estimateRequestedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceRequest"
ADD CONSTRAINT "MaintenanceRequest_estimateSubmittedByUserId_fkey"
FOREIGN KEY ("estimateSubmittedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
