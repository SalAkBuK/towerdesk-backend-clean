CREATE TYPE "MaintenanceRequestCommentReadScope" AS ENUM ('BUILDING', 'PROVIDER');

CREATE TABLE "MaintenanceRequestCommentReadState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "scope" "MaintenanceRequestCommentReadScope" NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRequestCommentReadState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaintenanceRequestCommentReadState_userId_requestId_scope_key"
ON "MaintenanceRequestCommentReadState"("userId", "requestId", "scope");

CREATE INDEX "MaintenanceRequestCommentReadState_userId_scope_lastReadAt_idx"
ON "MaintenanceRequestCommentReadState"("userId", "scope", "lastReadAt");

CREATE INDEX "MaintenanceRequestCommentReadState_requestId_scope_idx"
ON "MaintenanceRequestCommentReadState"("requestId", "scope");

ALTER TABLE "MaintenanceRequestCommentReadState"
ADD CONSTRAINT "MaintenanceRequestCommentReadState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaintenanceRequestCommentReadState"
ADD CONSTRAINT "MaintenanceRequestCommentReadState_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "MaintenanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
