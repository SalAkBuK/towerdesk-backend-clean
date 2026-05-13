-- Rename existing provider manager role to admin for the provider-owned model.
ALTER TYPE "ServiceProviderUserRole" RENAME VALUE 'MANAGER' TO 'ADMIN';

-- CreateEnum
CREATE TYPE "ServiceProviderAccessGrantStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- Drop old org-owned provider constraints/indexes.
DROP INDEX "ServiceProvider_orgId_isActive_idx";
DROP INDEX "ServiceProvider_orgId_name_idx";
ALTER TABLE "ServiceProvider" DROP CONSTRAINT "ServiceProvider_orgId_fkey";

-- Service providers are now global directory records.
ALTER TABLE "ServiceProvider" DROP COLUMN "orgId";

-- CreateTable
CREATE TABLE "ServiceProviderAccessGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "serviceProviderId" TEXT NOT NULL,
    "status" "ServiceProviderAccessGrantStatus" NOT NULL DEFAULT 'PENDING',
    "inviteEmail" TEXT,
    "invitedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "grantedByUserId" TEXT,
    "disabledAt" TIMESTAMP(3),
    "disabledByUserId" TEXT,
    "verificationMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceProviderAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceProvider_isActive_idx" ON "ServiceProvider"("isActive");
CREATE INDEX "ServiceProvider_name_idx" ON "ServiceProvider"("name");
CREATE INDEX "ServiceProviderAccessGrant_userId_status_idx" ON "ServiceProviderAccessGrant"("userId", "status");
CREATE INDEX "ServiceProviderAccessGrant_serviceProviderId_status_idx" ON "ServiceProviderAccessGrant"("serviceProviderId", "status");
CREATE INDEX "ServiceProviderAccessGrant_createdAt_idx" ON "ServiceProviderAccessGrant"("createdAt");

-- AddForeignKey
ALTER TABLE "ServiceProviderAccessGrant" ADD CONSTRAINT "ServiceProviderAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceProviderAccessGrant" ADD CONSTRAINT "ServiceProviderAccessGrant_serviceProviderId_fkey" FOREIGN KEY ("serviceProviderId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceProviderAccessGrant" ADD CONSTRAINT "ServiceProviderAccessGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceProviderAccessGrant" ADD CONSTRAINT "ServiceProviderAccessGrant_disabledByUserId_fkey" FOREIGN KEY ("disabledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
