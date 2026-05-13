-- CreateEnum
CREATE TYPE "MaintenanceRequestType" AS ENUM ('CLEANING', 'ELECTRICAL', 'MAINTENANCE', 'PLUMBING_AC_HEATING', 'OTHER');

-- AlterTable
ALTER TABLE "MaintenanceRequest" ADD COLUMN "type" "MaintenanceRequestType";
