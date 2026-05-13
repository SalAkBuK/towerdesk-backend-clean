-- CreateEnum
CREATE TYPE "AccessItemStatus" AS ENUM ('ISSUED', 'RETURNED', 'DEACTIVATED');

-- CreateTable
CREATE TABLE "LeaseAccessCard" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "status" "AccessItemStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseAccessCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseParkingSticker" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "stickerNumber" TEXT NOT NULL,
    "status" "AccessItemStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseParkingSticker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaseAccessCard_leaseId_cardNumber_key" ON "LeaseAccessCard"("leaseId", "cardNumber");

-- CreateIndex
CREATE INDEX "LeaseAccessCard_leaseId_idx" ON "LeaseAccessCard"("leaseId");

-- CreateIndex
CREATE INDEX "LeaseAccessCard_leaseId_status_idx" ON "LeaseAccessCard"("leaseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseParkingSticker_leaseId_stickerNumber_key" ON "LeaseParkingSticker"("leaseId", "stickerNumber");

-- CreateIndex
CREATE INDEX "LeaseParkingSticker_leaseId_idx" ON "LeaseParkingSticker"("leaseId");

-- CreateIndex
CREATE INDEX "LeaseParkingSticker_leaseId_status_idx" ON "LeaseParkingSticker"("leaseId", "status");

-- AddForeignKey
ALTER TABLE "LeaseAccessCard" ADD CONSTRAINT "LeaseAccessCard_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseParkingSticker" ADD CONSTRAINT "LeaseParkingSticker_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
