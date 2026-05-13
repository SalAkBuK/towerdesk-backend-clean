CREATE TYPE "PushDeliveryReceiptStatus" AS ENUM (
    'PENDING',
    'DELIVERED',
    'ERROR'
);

CREATE TABLE "PushDeliveryReceipt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "provider" "PushProvider" NOT NULL,
    "platform" "PushPlatform" NOT NULL DEFAULT 'UNKNOWN',
    "userId" TEXT,
    "pushDeviceId" TEXT,
    "deviceTokenMasked" TEXT,
    "providerTicketId" TEXT,
    "providerReceiptId" TEXT,
    "status" "PushDeliveryReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "details" JSONB,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDeliveryReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDeliveryReceipt_providerTicketId_key"
    ON "PushDeliveryReceipt"("providerTicketId");

CREATE INDEX "PushDeliveryReceipt_taskId_status_createdAt_idx"
    ON "PushDeliveryReceipt"("taskId", "status", "createdAt");

CREATE INDEX "PushDeliveryReceipt_provider_status_checkedAt_idx"
    ON "PushDeliveryReceipt"("provider", "status", "checkedAt");

ALTER TABLE "PushDeliveryReceipt" ADD CONSTRAINT "PushDeliveryReceipt_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "DeliveryTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
