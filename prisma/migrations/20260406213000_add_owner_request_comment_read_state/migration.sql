CREATE TABLE "OwnerRequestCommentReadState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerRequestCommentReadState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OwnerRequestCommentReadState_userId_requestId_key"
ON "OwnerRequestCommentReadState"("userId", "requestId");

CREATE INDEX "OwnerRequestCommentReadState_userId_lastReadAt_idx"
ON "OwnerRequestCommentReadState"("userId", "lastReadAt");

CREATE INDEX "OwnerRequestCommentReadState_requestId_idx"
ON "OwnerRequestCommentReadState"("requestId");

ALTER TABLE "OwnerRequestCommentReadState"
ADD CONSTRAINT "OwnerRequestCommentReadState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OwnerRequestCommentReadState"
ADD CONSTRAINT "OwnerRequestCommentReadState_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "MaintenanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
