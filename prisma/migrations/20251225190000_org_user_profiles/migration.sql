-- Add profile fields
ALTER TABLE "Org" ADD COLUMN "logoUrl" TEXT;

ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
