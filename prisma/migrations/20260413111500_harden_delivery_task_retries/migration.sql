ALTER TYPE "DeliveryTaskStatus" ADD VALUE IF NOT EXISTS 'RETRIED';

ALTER TABLE "DeliveryTask"
ADD COLUMN "retriedAt" TIMESTAMP(3),
ADD COLUMN "replacedByTaskId" TEXT;

CREATE INDEX "DeliveryTask_replacedByTaskId_idx"
    ON "DeliveryTask"("replacedByTaskId");
