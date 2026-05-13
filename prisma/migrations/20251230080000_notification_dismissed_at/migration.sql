-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "dismissedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_orgId_recipientUserId_dismissedAt_createdAt_idx" ON "Notification"("orgId", "recipientUserId", "dismissedAt", "createdAt");
