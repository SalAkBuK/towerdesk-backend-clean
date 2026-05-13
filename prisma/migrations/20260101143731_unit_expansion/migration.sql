-- CreateEnum
CREATE TYPE "MaintenancePayer" AS ENUM ('OWNER', 'TENANT');

-- CreateEnum
CREATE TYPE "KitchenType" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FurnishedStatus" AS ENUM ('UNFURNISHED', 'SEMI_FURNISHED', 'FULLY_FURNISHED');

-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL');

-- CreateEnum
CREATE TYPE "UnitSizeUnit" AS ENUM ('SQ_FT', 'SQ_M');

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "balcony" BOOLEAN,
ADD COLUMN     "bathrooms" INTEGER,
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "electricityMeterNumber" TEXT,
ADD COLUMN     "furnishedStatus" "FurnishedStatus",
ADD COLUMN     "gasMeterNumber" TEXT,
ADD COLUMN     "kitchenType" "KitchenType",
ADD COLUMN     "maintenancePayer" "MaintenancePayer",
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "paymentFrequency" "PaymentFrequency",
ADD COLUMN     "rentAnnual" DECIMAL(12,2),
ADD COLUMN     "securityDepositAmount" DECIMAL(12,2),
ADD COLUMN     "serviceChargePerUnit" DECIMAL(12,2),
ADD COLUMN     "unitSize" DECIMAL(12,2),
ADD COLUMN     "unitSizeUnit" "UnitSizeUnit",
ADD COLUMN     "unitTypeId" TEXT,
ADD COLUMN     "vatApplicable" BOOLEAN,
ADD COLUMN     "waterMeterNumber" TEXT;

-- CreateTable
CREATE TABLE "UnitType" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnitType_orgId_idx" ON "UnitType"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitType_orgId_name_key" ON "UnitType"("orgId", "name");

-- CreateIndex
CREATE INDEX "Owner_orgId_idx" ON "Owner"("orgId");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "UnitType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitType" ADD CONSTRAINT "UnitType_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
