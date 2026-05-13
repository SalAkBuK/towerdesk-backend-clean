-- CreateEnum
CREATE TYPE "VisitorType" AS ENUM ('GUEST_VISITOR', 'DELIVERY_RIDER', 'COURIER_PARCEL', 'SERVICE_PROVIDER', 'MAINTENANCE_TECHNICIAN', 'HOUSEKEEPING_CLEANER', 'CONTRACTOR_WORKER', 'DRIVER_PICKUP', 'SECURITY_STAFF_EXTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "VisitorStatus" AS ENUM ('EXPECTED', 'ARRIVED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" "VisitorType" NOT NULL,
    "status" "VisitorStatus" NOT NULL DEFAULT 'EXPECTED',
    "visitorName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "emiratesId" TEXT,
    "vehicleNumber" TEXT,
    "expectedArrivalAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visitor_orgId_buildingId_idx" ON "Visitor"("orgId", "buildingId");

-- CreateIndex
CREATE INDEX "Visitor_unitId_idx" ON "Visitor"("unitId");

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
