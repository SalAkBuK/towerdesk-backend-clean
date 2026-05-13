-- Extend existing LeaseStatus enum for contract lifecycle support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'DRAFT'
      AND enumtypid = '"LeaseStatus"'::regtype
  ) THEN
    ALTER TYPE "LeaseStatus" ADD VALUE 'DRAFT' BEFORE 'ACTIVE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'CANCELLED'
      AND enumtypid = '"LeaseStatus"'::regtype
  ) THEN
    ALTER TYPE "LeaseStatus" ADD VALUE 'CANCELLED' AFTER 'ENDED';
  END IF;
END $$;

-- Extend lease activity enum for contract/move request events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'MOVE_IN_REQUEST_CREATED'
      AND enumtypid = '"LeaseActivityAction"'::regtype
  ) THEN
    ALTER TYPE "LeaseActivityAction" ADD VALUE 'MOVE_IN_REQUEST_CREATED' AFTER 'MOVE_OUT';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'MOVE_IN_REQUEST_APPROVED'
      AND enumtypid = '"LeaseActivityAction"'::regtype
  ) THEN
    ALTER TYPE "LeaseActivityAction" ADD VALUE 'MOVE_IN_REQUEST_APPROVED' AFTER 'MOVE_IN_REQUEST_CREATED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'MOVE_IN_REQUEST_REJECTED'
      AND enumtypid = '"LeaseActivityAction"'::regtype
  ) THEN
    ALTER TYPE "LeaseActivityAction" ADD VALUE 'MOVE_IN_REQUEST_REJECTED' AFTER 'MOVE_IN_REQUEST_APPROVED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'MOVE_OUT_REQUEST_CREATED'
      AND enumtypid = '"LeaseActivityAction"'::regtype
  ) THEN
    ALTER TYPE "LeaseActivityAction" ADD VALUE 'MOVE_OUT_REQUEST_CREATED' AFTER 'MOVE_IN_REQUEST_REJECTED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'MOVE_OUT_REQUEST_APPROVED'
      AND enumtypid = '"LeaseActivityAction"'::regtype
  ) THEN
    ALTER TYPE "LeaseActivityAction" ADD VALUE 'MOVE_OUT_REQUEST_APPROVED' AFTER 'MOVE_OUT_REQUEST_CREATED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'MOVE_OUT_REQUEST_REJECTED'
      AND enumtypid = '"LeaseActivityAction"'::regtype
  ) THEN
    ALTER TYPE "LeaseActivityAction" ADD VALUE 'MOVE_OUT_REQUEST_REJECTED' AFTER 'MOVE_OUT_REQUEST_APPROVED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'CONTRACT_ACTIVATED'
      AND enumtypid = '"LeaseActivityAction"'::regtype
  ) THEN
    ALTER TYPE "LeaseActivityAction" ADD VALUE 'CONTRACT_ACTIVATED' AFTER 'MOVE_OUT_REQUEST_REJECTED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'CONTRACT_CANCELLED'
      AND enumtypid = '"LeaseActivityAction"'::regtype
  ) THEN
    ALTER TYPE "LeaseActivityAction" ADD VALUE 'CONTRACT_CANCELLED' AFTER 'CONTRACT_ACTIVATED';
  END IF;
END $$;

-- New enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PropertyUsage') THEN
    CREATE TYPE "PropertyUsage" AS ENUM ('INDUSTRIAL', 'COMMERCIAL', 'RESIDENTIAL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MoveRequestStatus') THEN
    CREATE TYPE "MoveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');
  END IF;
END $$;

-- Lease table updates for contract-first flow
ALTER TABLE "Lease" ALTER COLUMN "occupancyId" DROP NOT NULL;

ALTER TABLE "Lease"
  ADD COLUMN IF NOT EXISTS "residentUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "ijariId" TEXT,
  ADD COLUMN IF NOT EXISTS "contractDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "propertyUsage" "PropertyUsage",
  ADD COLUMN IF NOT EXISTS "ownerNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "landlordNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "tenantNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "tenantEmailSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "landlordEmailSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "tenantPhoneSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "landlordPhoneSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "buildingNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "locationCommunity" TEXT,
  ADD COLUMN IF NOT EXISTS "propertySizeSqm" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "propertyTypeLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "propertyNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "premisesNoDewa" TEXT,
  ADD COLUMN IF NOT EXISTS "plotNo" TEXT,
  ADD COLUMN IF NOT EXISTS "contractValue" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "paymentModeText" TEXT;

ALTER TABLE "Lease"
  ADD CONSTRAINT "Lease_residentUserId_fkey"
  FOREIGN KEY ("residentUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Lease_residentUserId_idx" ON "Lease"("residentUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "Lease_orgId_ijariId_key" ON "Lease"("orgId", "ijariId");

-- Additional legal terms
CREATE TABLE IF NOT EXISTS "LeaseAdditionalTerm" (
  "id" TEXT NOT NULL,
  "leaseId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "termText" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeaseAdditionalTerm_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeaseAdditionalTerm_leaseId_idx" ON "LeaseAdditionalTerm"("leaseId");
CREATE INDEX IF NOT EXISTS "LeaseAdditionalTerm_orgId_leaseId_idx" ON "LeaseAdditionalTerm"("orgId", "leaseId");

ALTER TABLE "LeaseAdditionalTerm"
  ADD CONSTRAINT "LeaseAdditionalTerm_leaseId_fkey"
  FOREIGN KEY ("leaseId") REFERENCES "Lease"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaseAdditionalTerm"
  ADD CONSTRAINT "LeaseAdditionalTerm_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Move request tables
CREATE TABLE IF NOT EXISTS "MoveInRequest" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "leaseId" TEXT NOT NULL,
  "residentUserId" TEXT NOT NULL,
  "status" "MoveRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedMoveAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MoveInRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MoveInRequest_orgId_buildingId_status_idx" ON "MoveInRequest"("orgId", "buildingId", "status");
CREATE INDEX IF NOT EXISTS "MoveInRequest_leaseId_status_idx" ON "MoveInRequest"("leaseId", "status");
CREATE INDEX IF NOT EXISTS "MoveInRequest_residentUserId_status_idx" ON "MoveInRequest"("residentUserId", "status");

ALTER TABLE "MoveInRequest"
  ADD CONSTRAINT "MoveInRequest_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoveInRequest"
  ADD CONSTRAINT "MoveInRequest_buildingId_fkey"
  FOREIGN KEY ("buildingId") REFERENCES "Building"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoveInRequest"
  ADD CONSTRAINT "MoveInRequest_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoveInRequest"
  ADD CONSTRAINT "MoveInRequest_leaseId_fkey"
  FOREIGN KEY ("leaseId") REFERENCES "Lease"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoveInRequest"
  ADD CONSTRAINT "MoveInRequest_residentUserId_fkey"
  FOREIGN KEY ("residentUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoveInRequest"
  ADD CONSTRAINT "MoveInRequest_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "MoveOutRequest" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "leaseId" TEXT NOT NULL,
  "residentUserId" TEXT NOT NULL,
  "status" "MoveRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedMoveAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MoveOutRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MoveOutRequest_orgId_buildingId_status_idx" ON "MoveOutRequest"("orgId", "buildingId", "status");
CREATE INDEX IF NOT EXISTS "MoveOutRequest_leaseId_status_idx" ON "MoveOutRequest"("leaseId", "status");
CREATE INDEX IF NOT EXISTS "MoveOutRequest_residentUserId_status_idx" ON "MoveOutRequest"("residentUserId", "status");

ALTER TABLE "MoveOutRequest"
  ADD CONSTRAINT "MoveOutRequest_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoveOutRequest"
  ADD CONSTRAINT "MoveOutRequest_buildingId_fkey"
  FOREIGN KEY ("buildingId") REFERENCES "Building"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoveOutRequest"
  ADD CONSTRAINT "MoveOutRequest_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoveOutRequest"
  ADD CONSTRAINT "MoveOutRequest_leaseId_fkey"
  FOREIGN KEY ("leaseId") REFERENCES "Lease"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoveOutRequest"
  ADD CONSTRAINT "MoveOutRequest_residentUserId_fkey"
  FOREIGN KEY ("residentUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoveOutRequest"
  ADD CONSTRAINT "MoveOutRequest_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Ensure only one PENDING request per contract per flow
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_pending_movein_per_lease"
ON "MoveInRequest"("leaseId")
WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_pending_moveout_per_lease"
ON "MoveOutRequest"("leaseId")
WHERE "status" = 'PENDING';
