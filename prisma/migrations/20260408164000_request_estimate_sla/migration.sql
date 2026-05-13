ALTER TABLE "MaintenanceRequest"
ADD COLUMN "estimateDueAt" TIMESTAMP(3),
ADD COLUMN "estimateReminderSentAt" TIMESTAMP(3);

CREATE INDEX "MaintenanceRequest_estimateDueAt_idx" ON "MaintenanceRequest"("estimateDueAt");
CREATE INDEX "MaintenanceRequest_estimateReminderSentAt_idx" ON "MaintenanceRequest"("estimateReminderSentAt");

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ESTIMATE_REMINDER';
