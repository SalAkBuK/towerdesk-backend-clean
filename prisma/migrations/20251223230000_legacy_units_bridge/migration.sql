-- CreateEnum
CREATE TYPE "UnitBridgeStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'INACTIVE');

-- CreateTable
CREATE TABLE "BuildingBridge" (
    "legacyBuildingId" INTEGER NOT NULL,
    "legacyAdminId" INTEGER NOT NULL,
    "buildingName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingBridge_pkey" PRIMARY KEY ("legacyBuildingId")
);

-- CreateTable
CREATE TABLE "UnitBridge" (
    "id" TEXT NOT NULL,
    "legacyBuildingId" INTEGER NOT NULL,
    "unitNumberRaw" TEXT NOT NULL,
    "unitNumberNorm" TEXT NOT NULL,
    "unitTypeName" TEXT,
    "status" "UnitBridgeStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitBridge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccupancyBridge" (
    "id" TEXT NOT NULL,
    "legacyTenantId" INTEGER NOT NULL,
    "unitId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OccupancyBridge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnitBridge_legacyBuildingId_unitNumberNorm_key" ON "UnitBridge"("legacyBuildingId", "unitNumberNorm");

-- CreateIndex
CREATE UNIQUE INDEX "OccupancyBridge_active_unitId_key" ON "OccupancyBridge"("unitId") WHERE "endDate" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "OccupancyBridge_active_legacyTenantId_key" ON "OccupancyBridge"("legacyTenantId") WHERE "endDate" IS NULL;

-- AddForeignKey
ALTER TABLE "UnitBridge" ADD CONSTRAINT "UnitBridge_legacyBuildingId_fkey" FOREIGN KEY ("legacyBuildingId") REFERENCES "BuildingBridge"("legacyBuildingId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyBridge" ADD CONSTRAINT "OccupancyBridge_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitBridge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
