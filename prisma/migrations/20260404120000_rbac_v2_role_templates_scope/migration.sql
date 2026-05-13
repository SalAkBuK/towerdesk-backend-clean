-- CreateEnum
CREATE TYPE "AccessScopeType" AS ENUM ('ORG', 'BUILDING');

-- AlterTable
ALTER TABLE "Role"
ADD COLUMN "scopeType" "AccessScopeType" NOT NULL DEFAULT 'ORG';

-- CreateTable
CREATE TABLE "UserAccessAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleTemplateId" TEXT NOT NULL,
    "scopeType" "AccessScopeType" NOT NULL,
    "scopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccessAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserAccessAssignment_userId_idx" ON "UserAccessAssignment"("userId");
CREATE INDEX "UserAccessAssignment_roleTemplateId_idx" ON "UserAccessAssignment"("roleTemplateId");
CREATE INDEX "UserAccessAssignment_scopeType_scopeId_idx" ON "UserAccessAssignment"("scopeType", "scopeId");
CREATE INDEX "UserAccessAssignment_userId_scopeType_scopeId_idx" ON "UserAccessAssignment"("userId", "scopeType", "scopeId");

-- AddForeignKey
ALTER TABLE "UserAccessAssignment"
ADD CONSTRAINT "UserAccessAssignment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAccessAssignment"
ADD CONSTRAINT "UserAccessAssignment_roleTemplateId_fkey"
FOREIGN KEY ("roleTemplateId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAccessAssignment"
ADD CONSTRAINT "UserAccessAssignment_scopeId_fkey"
FOREIGN KEY ("scopeId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Normalize system template scope metadata.
UPDATE "Role"
SET "scopeType" = 'ORG'
WHERE "key" IN ('org_admin', 'viewer', 'platform_superadmin', 'admin', 'manager', 'resident');

-- Materialize visible custom templates for legacy org roles that are no longer part
-- of the v2 public system template set, while preserving their legacy permissions.
WITH legacy_role_migrations AS (
  SELECT
    legacy."id" AS "legacyRoleId",
    legacy."orgId",
    legacy."key" AS "legacyKey",
    CASE legacy."key"
      WHEN 'admin' THEN 'legacy_admin_migrated'
      WHEN 'manager' THEN 'legacy_manager_migrated'
    END AS "migratedKey",
    CASE legacy."key"
      WHEN 'admin' THEN 'Legacy Admin (Migrated)'
      WHEN 'manager' THEN 'Legacy Manager (Migrated)'
    END AS "migratedName",
    CASE legacy."key"
      WHEN 'admin' THEN 'Migrated from the legacy admin org role during RBAC v2 cutover'
      WHEN 'manager' THEN 'Migrated from the legacy manager org role during RBAC v2 cutover'
    END AS "migratedDescription"
  FROM "Role" legacy
  WHERE legacy."orgId" IS NOT NULL
    AND legacy."key" IN ('admin', 'manager')
)
INSERT INTO "Role" (
  "id",
  "orgId",
  "key",
  "name",
  "description",
  "isSystem",
  "scopeType",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(migrations."orgId" || ':' || migrations."migratedKey"),
  migrations."orgId",
  migrations."migratedKey",
  migrations."migratedName",
  migrations."migratedDescription",
  false,
  'ORG'::"AccessScopeType",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM legacy_role_migrations migrations
ON CONFLICT ("orgId", "key") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "isSystem" = false,
  "scopeType" = 'ORG'::"AccessScopeType",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH legacy_role_migrations AS (
  SELECT
    legacy."id" AS "legacyRoleId",
    migrated."id" AS "migratedRoleId"
  FROM "Role" legacy
  INNER JOIN "Role" migrated
    ON migrated."orgId" = legacy."orgId"
   AND migrated."key" = CASE legacy."key"
     WHEN 'admin' THEN 'legacy_admin_migrated'
     WHEN 'manager' THEN 'legacy_manager_migrated'
   END
  WHERE legacy."orgId" IS NOT NULL
    AND legacy."key" IN ('admin', 'manager')
)
INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT
  migrations."migratedRoleId",
  permissions."permissionId",
  CURRENT_TIMESTAMP
FROM legacy_role_migrations migrations
INNER JOIN "RolePermission" permissions
  ON permissions."roleId" = migrations."legacyRoleId"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Ensure v2 building-scoped system templates exist for every org.
WITH building_templates("key", "name", "description") AS (
  VALUES
    ('building_admin', 'Building Admin', 'Full building-scoped administration'),
    ('building_manager', 'Building Manager', 'Building-scoped management access'),
    ('building_staff', 'Building Staff', 'Building-scoped operational staff access')
)
INSERT INTO "Role" (
  "id",
  "orgId",
  "key",
  "name",
  "description",
  "isSystem",
  "scopeType",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(orgs."id" || ':' || templates."key"),
  orgs."id",
  templates."key",
  templates."name",
  templates."description",
  true,
  'BUILDING'::"AccessScopeType",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Org" orgs
CROSS JOIN building_templates templates
ON CONFLICT ("orgId", "key") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "isSystem" = true,
  "scopeType" = EXCLUDED."scopeType",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Migrate org-scoped staff/admin assignments from legacy UserRole rows.
INSERT INTO "UserAccessAssignment" (
  "id",
  "userId",
  "roleTemplateId",
  "scopeType",
  "scopeId",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(
    ur."userId" || ':' || COALESCE(migrated_templates."id", ur."roleId") || ':ORG'
  ),
  ur."userId",
  COALESCE(migrated_templates."id", ur."roleId"),
  'ORG'::"AccessScopeType",
  NULL,
  ur."createdAt",
  CURRENT_TIMESTAMP
FROM "UserRole" ur
INNER JOIN "Role" role_template
  ON role_template."id" = ur."roleId"
LEFT JOIN "Role" migrated_templates
  ON migrated_templates."orgId" = role_template."orgId"
 AND migrated_templates."key" = CASE role_template."key"
   WHEN 'admin' THEN 'legacy_admin_migrated'
   WHEN 'manager' THEN 'legacy_manager_migrated'
   ELSE NULL
 END
WHERE role_template."key" <> 'resident'
  AND (
    role_template."key" NOT IN ('admin', 'manager')
    OR migrated_templates."id" IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "UserAccessAssignment" existing
    WHERE existing."userId" = ur."userId"
      AND existing."roleTemplateId" = COALESCE(migrated_templates."id", ur."roleId")
      AND existing."scopeType" = 'ORG'
      AND existing."scopeId" IS NULL
  );

-- Migrate legacy building assignments into building-scoped role template assignments.
WITH mapped_building_assignments AS (
  SELECT
    ba."userId",
    mapped_templates."id" AS "roleTemplateId",
    ba."buildingId" AS "scopeId",
    ba."createdAt"
  FROM "BuildingAssignment" ba
  INNER JOIN "Building" buildings
    ON buildings."id" = ba."buildingId"
  INNER JOIN "Role" mapped_templates
    ON mapped_templates."orgId" = buildings."orgId"
   AND mapped_templates."scopeType" = 'BUILDING'
   AND (
     (ba."type" = 'MANAGER' AND mapped_templates."key" = 'building_manager')
     OR (ba."type" = 'STAFF' AND mapped_templates."key" = 'building_staff')
     OR (ba."type" = 'BUILDING_ADMIN' AND mapped_templates."key" = 'building_admin')
   )
)
INSERT INTO "UserAccessAssignment" (
  "id",
  "userId",
  "roleTemplateId",
  "scopeType",
  "scopeId",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(mapped."userId" || ':' || mapped."roleTemplateId" || ':' || mapped."scopeId"),
  mapped."userId",
  mapped."roleTemplateId",
  'BUILDING'::"AccessScopeType",
  mapped."scopeId",
  mapped."createdAt",
  CURRENT_TIMESTAMP
FROM mapped_building_assignments mapped
WHERE NOT EXISTS (
  SELECT 1
  FROM "UserAccessAssignment" existing
  WHERE existing."userId" = mapped."userId"
    AND existing."roleTemplateId" = mapped."roleTemplateId"
    AND existing."scopeType" = 'BUILDING'
    AND existing."scopeId" = mapped."scopeId"
);
