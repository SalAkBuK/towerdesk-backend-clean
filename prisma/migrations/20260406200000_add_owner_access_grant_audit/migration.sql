CREATE TYPE "OwnerAccessGrantAuditAction" AS ENUM (
  'INVITED',
  'LINKED',
  'ACTIVATED',
  'DISABLED',
  'RESENT'
);

CREATE TABLE "OwnerAccessGrantAudit" (
  "id" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" "OwnerAccessGrantAuditAction" NOT NULL,
  "fromStatus" "OwnerAccessGrantStatus",
  "toStatus" "OwnerAccessGrantStatus" NOT NULL,
  "userId" TEXT,
  "inviteEmail" TEXT,
  "verificationMethod" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OwnerAccessGrantAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OwnerAccessGrantAudit_ownerId_createdAt_idx" ON "OwnerAccessGrantAudit"("ownerId", "createdAt");
CREATE INDEX "OwnerAccessGrantAudit_grantId_createdAt_idx" ON "OwnerAccessGrantAudit"("grantId", "createdAt");
CREATE INDEX "OwnerAccessGrantAudit_actorUserId_idx" ON "OwnerAccessGrantAudit"("actorUserId");

ALTER TABLE "OwnerAccessGrantAudit"
ADD CONSTRAINT "OwnerAccessGrantAudit_grantId_fkey"
FOREIGN KEY ("grantId") REFERENCES "OwnerAccessGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OwnerAccessGrantAudit"
ADD CONSTRAINT "OwnerAccessGrantAudit_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OwnerAccessGrantAudit"
ADD CONSTRAINT "OwnerAccessGrantAudit_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
