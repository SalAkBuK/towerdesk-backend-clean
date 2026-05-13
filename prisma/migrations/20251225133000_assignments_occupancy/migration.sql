-- CreateEnum
CREATE TYPE "BuildingAssignmentType" AS ENUM ('MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "OccupancyStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "BuildingAssignment" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BuildingAssignmentType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occupancy" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "residentUserId" TEXT NOT NULL,
    "status" "OccupancyStatus" NOT NULL DEFAULT 'ACTIVE',
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Occupancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuildingAssignment_buildingId_userId_type_key" ON "BuildingAssignment"("buildingId", "userId", "type");

-- CreateIndex
CREATE INDEX "BuildingAssignment_buildingId_idx" ON "BuildingAssignment"("buildingId");

-- CreateIndex
CREATE INDEX "BuildingAssignment_userId_idx" ON "BuildingAssignment"("userId");

-- CreateIndex
CREATE INDEX "Occupancy_buildingId_idx" ON "Occupancy"("buildingId");

-- CreateIndex
CREATE INDEX "Occupancy_unitId_idx" ON "Occupancy"("unitId");

-- CreateIndex
CREATE INDEX "Occupancy_residentUserId_idx" ON "Occupancy"("residentUserId");

-- AddForeignKey
ALTER TABLE "BuildingAssignment" ADD CONSTRAINT "BuildingAssignment_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingAssignment" ADD CONSTRAINT "BuildingAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occupancy" ADD CONSTRAINT "Occupancy_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occupancy" ADD CONSTRAINT "Occupancy_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occupancy" ADD CONSTRAINT "Occupancy_residentUserId_fkey" FOREIGN KEY ("residentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
