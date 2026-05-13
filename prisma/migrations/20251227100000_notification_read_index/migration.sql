CREATE INDEX "Notification_orgId_recipientUserId_readAt_createdAt_idx"
ON "Notification"("orgId", "recipientUserId", "readAt", "createdAt");
