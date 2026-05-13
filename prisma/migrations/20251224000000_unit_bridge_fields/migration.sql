-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('apartment', 'flat', 'shop');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('building', 'other');

-- CreateEnum
CREATE TYPE "WaterConnectionType" AS ENUM ('shared', 'separate');

-- CreateEnum
CREATE TYPE "ParkingType" AS ENUM ('basement', 'open');

-- CreateEnum
CREATE TYPE "AreaUnit" AS ENUM ('sqft', 'sqm');

-- AlterTable
ALTER TABLE "UnitBridge"
DROP COLUMN "unitTypeName",
ADD COLUMN "unitType" "UnitType" NOT NULL DEFAULT 'apartment',
ADD COLUMN "floorNumber" TEXT NOT NULL DEFAULT '0',
ADD COLUMN "ownershipType" "OwnershipType" NOT NULL DEFAULT 'building',
ADD COLUMN "furnished" BOOLEAN,
ADD COLUMN "areaSize" DECIMAL(12,2),
ADD COLUMN "areaUnit" "AreaUnit",
ADD COLUMN "numberOfRooms" INTEGER,
ADD COLUMN "numberOfBedrooms" INTEGER,
ADD COLUMN "numberOfBathrooms" INTEGER,
ADD COLUMN "kitchen" BOOLEAN,
ADD COLUMN "balcony" BOOLEAN,
ADD COLUMN "ownerName" TEXT,
ADD COLUMN "ownerCnicOrId" TEXT,
ADD COLUMN "ownerContactNumber" TEXT,
ADD COLUMN "electricityMeterNumber" TEXT,
ADD COLUMN "gasMeterNumber" TEXT,
ADD COLUMN "waterConnectionType" "WaterConnectionType",
ADD COLUMN "monthlyRent" DECIMAL(12,2),
ADD COLUMN "maintenanceCharges" DECIMAL(12,2),
ADD COLUMN "securityDeposit" DECIMAL(12,2),
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'PKR',
ADD COLUMN "parkingSlotNumber" TEXT,
ADD COLUMN "parkingType" "ParkingType";

-- Align defaults with Prisma schema
ALTER TABLE "UnitBridge" ALTER COLUMN "unitType" DROP DEFAULT;
ALTER TABLE "UnitBridge" ALTER COLUMN "floorNumber" DROP DEFAULT;
ALTER TABLE "UnitBridge" ALTER COLUMN "ownershipType" DROP DEFAULT;
