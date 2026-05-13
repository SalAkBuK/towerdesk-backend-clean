CREATE TYPE "MaintenanceRequestCommentAuthorType" AS ENUM (
  'OWNER',
  'TENANT',
  'STAFF',
  'SYSTEM'
);

CREATE TYPE "MaintenanceRequestCommentVisibility" AS ENUM (
  'SHARED',
  'INTERNAL'
);

ALTER TABLE "MaintenanceRequestComment"
ADD COLUMN "authorOwnerId" TEXT,
ADD COLUMN "authorType" "MaintenanceRequestCommentAuthorType",
ADD COLUMN "visibility" "MaintenanceRequestCommentVisibility" NOT NULL DEFAULT 'SHARED';

UPDATE "MaintenanceRequestComment" comment
SET "authorType" = CASE
  WHEN request."createdByUserId" = comment."authorUserId" THEN 'TENANT'::"MaintenanceRequestCommentAuthorType"
  ELSE 'STAFF'::"MaintenanceRequestCommentAuthorType"
END
FROM "MaintenanceRequest" request
WHERE request."id" = comment."requestId";

ALTER TABLE "MaintenanceRequestComment"
ALTER COLUMN "authorType" SET NOT NULL;

CREATE INDEX "MaintenanceRequestComment_requestId_visibility_createdAt_idx"
ON "MaintenanceRequestComment"("requestId", "visibility", "createdAt");

CREATE INDEX "MaintenanceRequestComment_authorOwnerId_idx"
ON "MaintenanceRequestComment"("authorOwnerId");

ALTER TABLE "MaintenanceRequestComment"
ADD CONSTRAINT "MaintenanceRequestComment_authorOwnerId_fkey"
FOREIGN KEY ("authorOwnerId") REFERENCES "Owner"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
