/*
  Warnings:

  - You are about to drop the column `includedParkingSlots` on the `Unit` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "PaymentFrequency" ADD VALUE 'ANNUAL';

-- AlterTable
ALTER TABLE "Unit" DROP COLUMN "includedParkingSlots";
