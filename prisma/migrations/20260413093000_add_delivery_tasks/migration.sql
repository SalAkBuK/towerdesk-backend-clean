CREATE TYPE "DeliveryTaskKind" AS ENUM (
    'AUTH_PASSWORD_EMAIL',
    'PUSH_NOTIFICATION',
    'BROADCAST_FANOUT'
);

CREATE TYPE "DeliveryTaskStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'SUCCEEDED',
    'FAILED'
);

CREATE TABLE "DeliveryTask" (
    "id" TEXT NOT NULL,
    "kind" "DeliveryTaskKind" NOT NULL,
    "status" "DeliveryTaskStatus" NOT NULL DEFAULT 'PENDING',
    "queueName" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "orgId" TEXT,
    "userId" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "payload" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryTask_status_kind_queuedAt_idx"
    ON "DeliveryTask"("status", "kind", "queuedAt");

CREATE INDEX "DeliveryTask_referenceType_referenceId_idx"
    ON "DeliveryTask"("referenceType", "referenceId");

CREATE INDEX "DeliveryTask_orgId_kind_createdAt_idx"
    ON "DeliveryTask"("orgId", "kind", "createdAt");

CREATE INDEX "DeliveryTask_userId_kind_createdAt_idx"
    ON "DeliveryTask"("userId", "kind", "createdAt");
