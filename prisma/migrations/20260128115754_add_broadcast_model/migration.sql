-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BROADCAST';

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "buildingIds" TEXT[],
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Broadcast_orgId_createdAt_idx" ON "Broadcast"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "Broadcast_senderUserId_idx" ON "Broadcast"("senderUserId");

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
