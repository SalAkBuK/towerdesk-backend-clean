CREATE TYPE "MaintenanceRequestOwnerApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE "MaintenanceRequestOwnerApprovalDecisionSource" AS ENUM ('OWNER', 'MANAGEMENT_OVERRIDE', 'EMERGENCY_OVERRIDE');

CREATE TYPE "MaintenanceRequestOwnerApprovalAuditAction" AS ENUM ('REQUIRED', 'REQUESTED', 'RESENT', 'APPROVED', 'REJECTED', 'OVERRIDDEN');

ALTER TABLE "MaintenanceRequest"
ADD COLUMN "ownerApprovalStatus" "MaintenanceRequestOwnerApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "ownerApprovalRequestedAt" TIMESTAMP(3),
ADD COLUMN "ownerApprovalRequestedByUserId" TEXT,
ADD COLUMN "ownerApprovalDeadlineAt" TIMESTAMP(3),
ADD COLUMN "ownerApprovalDecidedAt" TIMESTAMP(3),
ADD COLUMN "ownerApprovalDecidedByOwnerUserId" TEXT,
ADD COLUMN "ownerApprovalReason" TEXT,
ADD COLUMN "approvalRequiredReason" TEXT,
ADD COLUMN "estimatedAmount" DECIMAL(12,2),
ADD COLUMN "estimatedCurrency" TEXT,
ADD COLUMN "ownerApprovalDecisionSource" "MaintenanceRequestOwnerApprovalDecisionSource",
ADD COLUMN "ownerApprovalOverrideReason" TEXT,
ADD COLUMN "ownerApprovalOverriddenByUserId" TEXT;

CREATE INDEX "MaintenanceRequest_ownerApprovalStatus_idx"
ON "MaintenanceRequest"("ownerApprovalStatus");

ALTER TABLE "MaintenanceRequest"
ADD CONSTRAINT "MaintenanceRequest_ownerApprovalRequestedByUserId_fkey"
FOREIGN KEY ("ownerApprovalRequestedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceRequest"
ADD CONSTRAINT "MaintenanceRequest_ownerApprovalDecidedByOwnerUserId_fkey"
FOREIGN KEY ("ownerApprovalDecidedByOwnerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceRequest"
ADD CONSTRAINT "MaintenanceRequest_ownerApprovalOverriddenByUserId_fkey"
FOREIGN KEY ("ownerApprovalOverriddenByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MaintenanceRequestOwnerApprovalAudit" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" "MaintenanceRequestOwnerApprovalAuditAction" NOT NULL,
    "fromStatus" "MaintenanceRequestOwnerApprovalStatus",
    "toStatus" "MaintenanceRequestOwnerApprovalStatus" NOT NULL,
    "decisionSource" "MaintenanceRequestOwnerApprovalDecisionSource",
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceRequestOwnerApprovalAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaintenanceRequestOwnerApprovalAudit_requestId_createdAt_idx"
ON "MaintenanceRequestOwnerApprovalAudit"("requestId", "createdAt");

CREATE INDEX "MaintenanceRequestOwnerApprovalAudit_orgId_createdAt_idx"
ON "MaintenanceRequestOwnerApprovalAudit"("orgId", "createdAt");

ALTER TABLE "MaintenanceRequestOwnerApprovalAudit"
ADD CONSTRAINT "MaintenanceRequestOwnerApprovalAudit_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "MaintenanceRequest"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaintenanceRequestOwnerApprovalAudit"
ADD CONSTRAINT "MaintenanceRequestOwnerApprovalAudit_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Org"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaintenanceRequestOwnerApprovalAudit"
ADD CONSTRAINT "MaintenanceRequestOwnerApprovalAudit_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
