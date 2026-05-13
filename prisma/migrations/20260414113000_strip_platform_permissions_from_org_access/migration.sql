-- Strip platform-scoped permissions from org-scoped RBAC data.
--
-- A bug in org role/permission management allowed `platform.*` permission keys
-- to be surfaced in tenant admin flows and accepted on writes. That produced
-- invalid org role-template bindings and invalid user-level overrides inside
-- tenant orgs. Platform permissions must remain reserved for platform context.

-- Remove any platform permissions that were attached to org role templates.
DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."orgId" IS NOT NULL
  AND p."key" LIKE 'platform.%';

-- Remove any platform permission overrides granted directly to org users.
DELETE FROM "UserPermission" up
USING "User" u, "Permission" p
WHERE up."userId" = u."id"
  AND up."permissionId" = p."id"
  AND u."orgId" IS NOT NULL
  AND p."key" LIKE 'platform.%';
