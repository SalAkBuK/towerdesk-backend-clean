-- CreateTable
CREATE TABLE "LeaseOccupant" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseOccupant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaseOccupant_leaseId_idx" ON "LeaseOccupant"("leaseId");

-- AddForeignKey
ALTER TABLE "LeaseOccupant" ADD CONSTRAINT "LeaseOccupant_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
