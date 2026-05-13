-- CreateEnum
CREATE TYPE "ResidentInviteStatus" AS ENUM ('SENT', 'FAILED', 'ACCEPTED');

-- CreateTable
CREATE TABLE "ResidentInvite" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "email" TEXT NOT NULL,
    "status" "ResidentInviteStatus" NOT NULL DEFAULT 'SENT',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidentInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResidentInvite_tokenHash_key" ON "ResidentInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "ResidentInvite_orgId_createdAt_idx" ON "ResidentInvite"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "ResidentInvite_userId_createdAt_idx" ON "ResidentInvite"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ResidentInvite_orgId_userId_createdAt_idx" ON "ResidentInvite"("orgId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "ResidentInvite_status_expiresAt_idx" ON "ResidentInvite"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "ResidentInvite" ADD CONSTRAINT "ResidentInvite_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentInvite" ADD CONSTRAINT "ResidentInvite_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentInvite" ADD CONSTRAINT "ResidentInvite_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
