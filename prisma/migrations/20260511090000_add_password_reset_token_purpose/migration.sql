ALTER TABLE "PasswordResetToken"
ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'PASSWORD_RESET';

UPDATE "PasswordResetToken" prt
SET "purpose" = COALESCE(dt.payload->>'purpose', 'PASSWORD_RESET')
FROM "DeliveryTask" dt
WHERE dt.kind = 'AUTH_PASSWORD_EMAIL'
  AND dt."referenceId" = prt."tokenHash";

CREATE INDEX "PasswordResetToken_userId_purpose_expiresAt_idx"
ON "PasswordResetToken"("userId", "purpose", "expiresAt");
