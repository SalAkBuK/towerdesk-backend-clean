-- CreateIndex
CREATE INDEX "BuildingBridge_legacyAdminId_idx" ON "BuildingBridge"("legacyAdminId");

-- CreateIndex
CREATE INDEX "OccupancyBridge_legacyTenantId_startDate_idx" ON "OccupancyBridge"("legacyTenantId", "startDate");
