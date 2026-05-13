-- CreateEnum
CREATE TYPE "LeaseActivityAction" AS ENUM ('MOVE_IN', 'MOVE_OUT', 'DOCUMENT_ADDED', 'DOCUMENT_DELETED', 'ACCESS_CARD_ISSUED', 'ACCESS_CARD_STATUS_CHANGED', 'ACCESS_CARD_DELETED', 'PARKING_STICKER_ISSUED', 'PARKING_STICKER_STATUS_CHANGED', 'PARKING_STICKER_DELETED', 'OCCUPANTS_REPLACED', 'PARKING_ALLOCATED');

-- CreateEnum
CREATE TYPE "LeaseActivitySource" AS ENUM ('USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "LeaseActivity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "action" "LeaseActivityAction" NOT NULL,
    "source" "LeaseActivitySource" NOT NULL DEFAULT 'USER',
    "changedByUserId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaseActivity_leaseId_idx" ON "LeaseActivity"("leaseId");

-- CreateIndex
CREATE INDEX "LeaseActivity_orgId_leaseId_createdAt_idx" ON "LeaseActivity"("orgId", "leaseId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeaseActivity" ADD CONSTRAINT "LeaseActivity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseActivity" ADD CONSTRAINT "LeaseActivity_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseActivity" ADD CONSTRAINT "LeaseActivity_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
