-- CreateEnum
CREATE TYPE "OrgBusinessType" AS ENUM ('OWNER', 'PROPERTY_MANAGEMENT', 'FACILITY_MANAGEMENT', 'DEVELOPER');

-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "businessEmailAddress" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "businessType" "OrgBusinessType",
ADD COLUMN     "city" TEXT,
ADD COLUMN     "officePhoneNumber" TEXT,
ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "registeredOfficeAddress" TEXT,
ADD COLUMN     "tradeLicenseNumber" TEXT,
ADD COLUMN     "vatRegistrationNumber" TEXT,
ADD COLUMN     "website" TEXT;
