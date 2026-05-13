CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "PartyStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PartyIdentifierType" AS ENUM ('EMIRATES_ID', 'PASSPORT', 'TRADE_LICENSE', 'VAT_TRN', 'OTHER');

-- CreateEnum
CREATE TYPE "OwnerAccessGrantStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "OwnerRegistryLookupResultStatus" AS ENUM ('MATCH_FOUND', 'NO_MATCH');

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "displayNameEn" TEXT NOT NULL,
    "displayNameAr" TEXT,
    "primaryEmail" TEXT,
    "primaryPhone" TEXT,
    "status" "PartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyIdentifier" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "identifierType" "PartyIdentifierType" NOT NULL,
    "countryCode" TEXT,
    "issuingAuthority" TEXT,
    "valueEncrypted" TEXT NOT NULL,
    "lookupHmac" TEXT NOT NULL,
    "last4" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "normalizationVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartyIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerAccessGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "ownerId" TEXT NOT NULL,
    "status" "OwnerAccessGrantStatus" NOT NULL DEFAULT 'PENDING',
    "inviteEmail" TEXT,
    "invitedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "grantedByUserId" TEXT,
    "disabledAt" TIMESTAMP(3),
    "disabledByUserId" TEXT,
    "verificationMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerRegistryLookupAudit" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorOrgId" TEXT NOT NULL,
    "identifierType" "PartyIdentifierType" NOT NULL,
    "lookupHmac" TEXT NOT NULL,
    "resultStatus" "OwnerRegistryLookupResultStatus" NOT NULL,
    "matchedPartyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerRegistryLookupAudit_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Owner"
ADD COLUMN "partyId" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "displayNameOverride" TEXT,
ADD COLUMN "contactEmailOverride" TEXT,
ADD COLUMN "contactPhoneOverride" TEXT,
ADD COLUMN "notes" TEXT;

-- CreateIndex
CREATE INDEX "Party_type_idx" ON "Party"("type");
CREATE INDEX "Party_displayNameEn_idx" ON "Party"("displayNameEn");
CREATE INDEX "Party_primaryEmail_idx" ON "Party"("primaryEmail");

CREATE INDEX "PartyIdentifier_partyId_identifierType_idx" ON "PartyIdentifier"("partyId", "identifierType");
CREATE INDEX "PartyIdentifier_identifierType_countryCode_issuingAuthority_lookupHmac_idx"
  ON "PartyIdentifier"("identifierType", "countryCode", "issuingAuthority", "lookupHmac");
CREATE UNIQUE INDEX "PartyIdentifier_exact_lookup_unique"
  ON "PartyIdentifier"(
    "identifierType",
    COALESCE("countryCode", ''),
    COALESCE("issuingAuthority", ''),
    "lookupHmac"
  )
  WHERE "deletedAt" IS NULL;

CREATE INDEX "Owner_partyId_idx" ON "Owner"("partyId");
CREATE INDEX "Owner_orgId_isActive_idx" ON "Owner"("orgId", "isActive");
CREATE UNIQUE INDEX "Owner_orgId_partyId_key" ON "Owner"("orgId", "partyId");

CREATE INDEX "OwnerAccessGrant_userId_status_idx" ON "OwnerAccessGrant"("userId", "status");
CREATE INDEX "OwnerAccessGrant_ownerId_status_idx" ON "OwnerAccessGrant"("ownerId", "status");
CREATE INDEX "OwnerAccessGrant_createdAt_idx" ON "OwnerAccessGrant"("createdAt");
CREATE UNIQUE INDEX "OwnerAccessGrant_owner_active_unique"
  ON "OwnerAccessGrant"("ownerId")
  WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "OwnerAccessGrant_user_owner_open_unique"
  ON "OwnerAccessGrant"("userId", "ownerId")
  WHERE "status" IN ('PENDING', 'ACTIVE') AND "userId" IS NOT NULL;
CREATE UNIQUE INDEX "OwnerAccessGrant_email_owner_open_unique"
  ON "OwnerAccessGrant"("inviteEmail", "ownerId")
  WHERE "status" IN ('PENDING', 'ACTIVE') AND "inviteEmail" IS NOT NULL;

CREATE INDEX "OwnerRegistryLookupAudit_actorUserId_createdAt_idx" ON "OwnerRegistryLookupAudit"("actorUserId", "createdAt");
CREATE INDEX "OwnerRegistryLookupAudit_actorOrgId_createdAt_idx" ON "OwnerRegistryLookupAudit"("actorOrgId", "createdAt");
CREATE INDEX "OwnerRegistryLookupAudit_identifierType_createdAt_idx" ON "OwnerRegistryLookupAudit"("identifierType", "createdAt");

-- Backfill one Party per existing Owner without deduping across orgs
WITH owner_party_map AS (
  SELECT "id" AS owner_id, gen_random_uuid()::text AS party_id
  FROM "Owner"
),
inserted AS (
  INSERT INTO "Party" (
    "id",
    "type",
    "displayNameEn",
    "displayNameAr",
    "primaryEmail",
    "primaryPhone",
    "status",
    "createdAt",
    "updatedAt"
  )
  SELECT
    map.party_id,
    'INDIVIDUAL'::"PartyType",
    owner."name",
    NULL,
    owner."email",
    owner."phone",
    'ACTIVE'::"PartyStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM owner_party_map map
  JOIN "Owner" owner ON owner."id" = map.owner_id
)
UPDATE "Owner" owner
SET "partyId" = map.party_id
FROM owner_party_map map
WHERE owner."id" = map.owner_id;

-- AddForeignKey
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartyIdentifier" ADD CONSTRAINT "PartyIdentifier_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnerAccessGrant" ADD CONSTRAINT "OwnerAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnerAccessGrant" ADD CONSTRAINT "OwnerAccessGrant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnerAccessGrant" ADD CONSTRAINT "OwnerAccessGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OwnerAccessGrant" ADD CONSTRAINT "OwnerAccessGrant_disabledByUserId_fkey" FOREIGN KEY ("disabledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OwnerRegistryLookupAudit" ADD CONSTRAINT "OwnerRegistryLookupAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnerRegistryLookupAudit" ADD CONSTRAINT "OwnerRegistryLookupAudit_actorOrgId_fkey" FOREIGN KEY ("actorOrgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnerRegistryLookupAudit" ADD CONSTRAINT "OwnerRegistryLookupAudit_matchedPartyId_fkey" FOREIGN KEY ("matchedPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
