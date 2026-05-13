ALTER TABLE "MaintenanceRequest"
ADD COLUMN "isEmergency" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isLikeForLike" BOOLEAN,
ADD COLUMN "isUpgrade" BOOLEAN,
ADD COLUMN "isMajorReplacement" BOOLEAN,
ADD COLUMN "isResponsibilityDisputed" BOOLEAN;
