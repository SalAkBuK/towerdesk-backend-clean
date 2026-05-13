-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'UNDER_MAINTENANCE', 'BLOCKED');

-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "noticeGivenDate" TIMESTAMP(3),
ADD COLUMN     "tenancyRegistrationExpiry" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE';
