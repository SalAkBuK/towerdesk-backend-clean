-- CreateEnum
CREATE TYPE "ServiceProviderUserRole" AS ENUM ('MANAGER', 'WORKER');

-- CreateTable
CREATE TABLE "ServiceProvider" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceCategory" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceProviderBuilding" (
    "serviceProviderId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceProviderBuilding_pkey" PRIMARY KEY ("serviceProviderId","buildingId")
);

-- CreateTable
CREATE TABLE "ServiceProviderUser" (
    "serviceProviderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ServiceProviderUserRole" NOT NULL DEFAULT 'WORKER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceProviderUser_pkey" PRIMARY KEY ("serviceProviderId","userId")
);

-- CreateIndex
CREATE INDEX "ServiceProvider_orgId_isActive_idx" ON "ServiceProvider"("orgId", "isActive");
CREATE INDEX "ServiceProvider_orgId_name_idx" ON "ServiceProvider"("orgId", "name");
CREATE INDEX "ServiceProviderBuilding_buildingId_idx" ON "ServiceProviderBuilding"("buildingId");
CREATE INDEX "ServiceProviderUser_userId_isActive_idx" ON "ServiceProviderUser"("userId", "isActive");
CREATE INDEX "ServiceProviderUser_serviceProviderId_role_isActive_idx" ON "ServiceProviderUser"("serviceProviderId", "role", "isActive");

-- AddForeignKey
ALTER TABLE "ServiceProvider" ADD CONSTRAINT "ServiceProvider_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceProviderBuilding" ADD CONSTRAINT "ServiceProviderBuilding_serviceProviderId_fkey" FOREIGN KEY ("serviceProviderId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceProviderBuilding" ADD CONSTRAINT "ServiceProviderBuilding_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceProviderUser" ADD CONSTRAINT "ServiceProviderUser_serviceProviderId_fkey" FOREIGN KEY ("serviceProviderId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceProviderUser" ADD CONSTRAINT "ServiceProviderUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
