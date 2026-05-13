-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "ServiceChargesPaidBy" AS ENUM ('OWNER', 'TENANT');

-- CreateEnum
CREATE TYPE "YesNo" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "ConditionStatus" AS ENUM ('OK', 'REPAIR_NEEDED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('BANK_TRANSFER', 'CHEQUE', 'CASH');

-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "occupancyId" TEXT NOT NULL,
    "status" "LeaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "leaseStartDate" TIMESTAMP(3) NOT NULL,
    "leaseEndDate" TIMESTAMP(3) NOT NULL,
    "annualRent" DECIMAL(12,2) NOT NULL,
    "paymentFrequency" "PaymentFrequency" NOT NULL,
    "numberOfCheques" INTEGER,
    "securityDepositAmount" DECIMAL(12,2) NOT NULL,
    "internetTvProvider" TEXT,
    "serviceChargesPaidBy" "ServiceChargesPaidBy",
    "vatApplicable" BOOLEAN,
    "notes" TEXT,
    "firstPaymentReceived" "YesNo",
    "firstPaymentAmount" DECIMAL(12,2),
    "depositReceived" "YesNo",
    "depositReceivedAmount" DECIMAL(12,2),
    "actualMoveOutDate" TIMESTAMP(3),
    "forwardingPhone" TEXT,
    "forwardingEmail" TEXT,
    "forwardingAddress" TEXT,
    "finalElectricityReading" TEXT,
    "finalWaterReading" TEXT,
    "finalGasReading" TEXT,
    "wallsCondition" "ConditionStatus",
    "floorCondition" "ConditionStatus",
    "kitchenCondition" "ConditionStatus",
    "bathroomCondition" "ConditionStatus",
    "doorsLocksCondition" "ConditionStatus",
    "keysReturned" "YesNo",
    "accessCardsReturnedCount" INTEGER,
    "parkingStickersReturned" "YesNo",
    "damageDescription" TEXT,
    "damageCharges" DECIMAL(12,2),
    "pendingRent" DECIMAL(12,2),
    "pendingUtilities" DECIMAL(12,2),
    "pendingServiceFines" DECIMAL(12,2),
    "totalDeductions" DECIMAL(12,2),
    "netRefund" DECIMAL(12,2),
    "inspectionDoneBy" TEXT,
    "inspectionDate" TIMESTAMP(3),
    "managerApproval" "ApprovalStatus",
    "refundMethod" "RefundMethod",
    "refundDate" TIMESTAMP(3),
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lease_occupancyId_key" ON "Lease"("occupancyId");

-- CreateIndex
CREATE INDEX "Lease_orgId_buildingId_idx" ON "Lease"("orgId", "buildingId");

-- CreateIndex
CREATE INDEX "Lease_unitId_idx" ON "Lease"("unitId");

-- CreateIndex
CREATE INDEX "Lease_occupancyId_idx" ON "Lease"("occupancyId");

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_occupancyId_fkey" FOREIGN KEY ("occupancyId") REFERENCES "Occupancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
