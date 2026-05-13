We have NestJS + Prisma. Platform endpoints are under controllers like:

@Controller('platform/orgs')
@UseGuards(PlatformAuthGuard)

Currently PlatformAuthGuard only checks x-platform-key (PLATFORM_API_KEY). We want Option B: allow real backend platform superadmin users to login via /auth/login and call platform endpoints using JWT + permissions, while keeping x-platform-key support.

Existing example:
PlatformOrgsController has POST /platform/orgs and POST /platform/orgs/:orgId/admins.
PlatformOrgsService uses prisma.org/user/role/userRole and creates org_admin users.

Implement these changes:

1) Add platform role + permissions
- Create role key: 'platform_superadmin' (GLOBAL role)
- Add permission keys:
  - 'platform.org.create' (required for POST /platform/orgs)
  - 'platform.org.admin.create' (required for POST /platform/orgs/:orgId/admins)
- If we already have Role/Permission tables, add seeds/migration to create these permissions + attach to role.
- Platform users must have orgId = null.

2) Seed a platform superadmin user
- Create seed or script (idempotent):
  - email: env PLATFORM_SUPERADMIN_EMAIL (fallback 'platform-admin@towerdesk.local')
  - password: env PLATFORM_SUPERADMIN_PASSWORD
  - orgId: null
  - mustChangePassword: true optional
  - assign role 'platform_superadmin'

3) Update /auth/login
- Ensure platform users can login using the same /auth/login endpoint.
- JWT payload includes userId and orgId (nullable).
- Do NOT require orgId for login.
- Existing org user behavior must remain unchanged.

4) Update PlatformAuthGuard
- Behavior:
  - If header 'x-platform-key' equals env PLATFORM_API_KEY => allow request immediately.
  - Else if Authorization Bearer JWT is present:
    - validate JWT
    - set req.user (if not already)
    - check effective permissions contain required platform permission for the route
    - allow if permission passes
  - Else deny (401/403).
- Permission mapping:
  - POST /platform/orgs requires 'platform.org.create'
  - POST /platform/orgs/:orgId/admins requires 'platform.org.admin.create'
- Implement permission requirement via a decorator, e.g.:
  - @RequirePermissions('platform.org.create')
  - @RequirePermissions('platform.org.admin.create')
  And PlatformAuthGuard reads metadata and enforces it.
  If no metadata is present on a platform route, default require 'platform.*' or deny (choose safest).

5) Block platform users from org-scoped routes
- Update OrgScopeGuard (or whichever guard protects /api/org/* routes):
  - If req.user exists but req.user.orgId is null => throw Forbidden (403)
  - This prevents platform users from calling org endpoints accidentally.

6) Tests (minimal e2e)
Add 3 E2E tests:
- Platform endpoint works with x-platform-key.
- Platform endpoint works with JWT of platform_superadmin.
- Platform user cannot access an org-scoped endpoint (403).

Keep existing behavior stable. Do not remove x-platform-key support. Use smallest changes and match existing code style (guards/metadata/permission service).
