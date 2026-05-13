-- AlterTable
ALTER TABLE "MaintenanceRequest"
ADD COLUMN "leaseIdAtCreation" TEXT;

-- CreateIndex
CREATE INDEX "MaintenanceRequest_leaseIdAtCreation_idx"
ON "MaintenanceRequest"("leaseIdAtCreation");

-- AddForeignKey
ALTER TABLE "MaintenanceRequest"
ADD CONSTRAINT "MaintenanceRequest_leaseIdAtCreation_fkey"
FOREIGN KEY ("leaseIdAtCreation") REFERENCES "Lease"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
