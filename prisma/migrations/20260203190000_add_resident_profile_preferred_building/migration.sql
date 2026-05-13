-- Add preferred building link for resident profiles
ALTER TABLE "ResidentProfile" ADD COLUMN "preferredBuildingId" TEXT;

ALTER TABLE "ResidentProfile"
ADD CONSTRAINT "ResidentProfile_preferredBuildingId_fkey"
FOREIGN KEY ("preferredBuildingId") REFERENCES "Building"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ResidentProfile_preferredBuildingId_idx"
ON "ResidentProfile"("preferredBuildingId");
