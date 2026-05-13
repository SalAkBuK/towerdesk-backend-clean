-- CreateTable
CREATE TABLE "BuildingAmenity" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingAmenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitAmenity" (
    "unitId" TEXT NOT NULL,
    "amenityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitAmenity_pkey" PRIMARY KEY ("unitId","amenityId")
);

-- CreateIndex
CREATE INDEX "BuildingAmenity_buildingId_idx" ON "BuildingAmenity"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "BuildingAmenity_buildingId_name_key" ON "BuildingAmenity"("buildingId", "name");

-- CreateIndex
CREATE INDEX "UnitAmenity_amenityId_idx" ON "UnitAmenity"("amenityId");

-- AddForeignKey
ALTER TABLE "BuildingAmenity" ADD CONSTRAINT "BuildingAmenity_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitAmenity" ADD CONSTRAINT "UnitAmenity_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitAmenity" ADD CONSTRAINT "UnitAmenity_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "BuildingAmenity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
