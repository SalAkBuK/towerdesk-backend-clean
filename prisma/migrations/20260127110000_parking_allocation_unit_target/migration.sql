-- AlterTable
ALTER TABLE "ParkingAllocation" ADD COLUMN "unitId" TEXT;
ALTER TABLE "ParkingAllocation" ALTER COLUMN "occupancyId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ParkingAllocation_orgId_unitId_idx" ON "ParkingAllocation"("orgId", "unitId");

-- AddForeignKey
ALTER TABLE "ParkingAllocation" ADD CONSTRAINT "ParkingAllocation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ensure exactly one of (occupancyId, unitId) is set
ALTER TABLE "ParkingAllocation" ADD CONSTRAINT "ParkingAllocation_target_xor_check" CHECK (("occupancyId" IS NULL) <> ("unitId" IS NULL));

