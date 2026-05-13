INSERT INTO "Permission" ("id", "key", "name", "description", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'buildings.delete',
  'Delete buildings',
  'Delete buildings in the org',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "Role" r
INNER JOIN "Permission" p
  ON p."key" = 'buildings.delete'
WHERE r."key" = 'org_admin'
  AND r."orgId" IS NOT NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
