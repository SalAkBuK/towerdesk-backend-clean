CREATE TYPE "ConversationType" AS ENUM (
    'MANAGEMENT',
    'RESIDENT_TO_MANAGEMENT',
    'RESIDENT_TO_OWNER',
    'OWNER_TO_MANAGEMENT',
    'OWNER_TO_TENANT'
);

ALTER TABLE "Conversation"
ADD COLUMN "type" "ConversationType" NOT NULL DEFAULT 'MANAGEMENT';

CREATE INDEX "Conversation_orgId_type_updatedAt_idx"
ON "Conversation"("orgId", "type", "updatedAt");
