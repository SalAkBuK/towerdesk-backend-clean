-- AlterEnum
ALTER TYPE "MaintenancePayer" ADD VALUE 'BUILDING';

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "includedParkingSlots" INTEGER;
