-- AlterTable
ALTER TABLE "MaintenanceRequest"
ADD COLUMN "serviceProviderId" TEXT,
ADD COLUMN "serviceProviderAssignedUserId" TEXT;

-- CreateIndex
CREATE INDEX "MaintenanceRequest_serviceProviderId_idx" ON "MaintenanceRequest"("serviceProviderId");
CREATE INDEX "MaintenanceRequest_serviceProviderAssignedUserId_idx" ON "MaintenanceRequest"("serviceProviderAssignedUserId");

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_serviceProviderId_fkey" FOREIGN KEY ("serviceProviderId") REFERENCES "ServiceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_serviceProviderAssignedUserId_fkey" FOREIGN KEY ("serviceProviderAssignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
