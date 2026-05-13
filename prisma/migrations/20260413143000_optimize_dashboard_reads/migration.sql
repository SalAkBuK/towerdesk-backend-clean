CREATE INDEX "Visitor_orgId_createdAt_idx"
ON "Visitor"("orgId", "createdAt");

CREATE INDEX "Lease_orgId_createdAt_idx"
ON "Lease"("orgId", "createdAt");

CREATE INDEX "ParkingAllocation_orgId_createdAt_idx"
ON "ParkingAllocation"("orgId", "createdAt");

CREATE INDEX "ParkingAllocation_orgId_endDate_idx"
ON "ParkingAllocation"("orgId", "endDate");

CREATE INDEX "MaintenanceRequest_orgId_createdAt_idx"
ON "MaintenanceRequest"("orgId", "createdAt");

CREATE INDEX "MaintenanceRequest_orgId_completedAt_idx"
ON "MaintenanceRequest"("orgId", "completedAt");

CREATE INDEX "MaintenanceRequest_orgId_canceledAt_idx"
ON "MaintenanceRequest"("orgId", "canceledAt");
