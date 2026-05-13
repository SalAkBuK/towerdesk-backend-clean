You are Codex. Update / extend my existing NestJS + Prisma backend (NestJS + TS + PostgreSQL + Prisma + JWT access/refresh) to support a dynamic, future-proof user authorization system.

CONTEXT
- Backend is already running; swagger works; auth endpoints exist.
- Do NOT implement product-specific user creation flows. Do NOT assume business rules like tenant/admin etc.
- Focus ONLY on a robust, dynamic authorization foundation: roles + permissions + assignments + guards + decorators.

GOALS
1) Support adding NEW roles and NEW permissions in the future WITHOUT code changes (as much as possible).
2) Support assigning permissions via roles AND optionally direct user overrides.
3) Support scoping permissions to a resource context later (e.g., buildingId/orgId) but keep the v1 implementation minimal and ready for extension.
4) Keep controllers thin; use guards; store everything in DB; make it testable.

DATA MODEL (Prisma)
- Add tables (do not use hardcoded role enums for authorization):
  - Role: id (uuid), key (string unique, e.g. "admin"), name (string), description (string?), isSystem (bool default true), createdAt, updatedAt
  - Permission: id (uuid), key (string unique, e.g. "users.read"), name (string), description (string?), createdAt, updatedAt
  - RolePermission: roleId, permissionId (composite unique), createdAt
  - UserRole: userId, roleId (composite unique), createdAt
  - UserPermission: userId, permissionId (composite unique), effect enum ("ALLOW"|"DENY") for overrides, createdAt
- Keep the existing User table; remove role enum usage if present; authorization should come from Role/Permission tables.

SEEDING
- Add a Prisma seed script that seeds:
  - baseline permissions: "users.read", "users.write", "roles.read", "roles.write" (minimal set)
  - baseline roles: "super_admin", "admin", "viewer" (or similar)
  - map role->permissions (super_admin gets all)
- Seed should be idempotent (upsert).
- Add npm script: "prisma:seed".

AUTH TOKEN CLAIMS
- Access token should include: sub=userId, email
- DO NOT stuff permissions into JWT (avoid huge tokens and stale auth).
- JWT strategy should attach user id; authorization guard should fetch permissions from DB with caching (optional in-memory) for request lifetime.

AUTHORIZATION API
- Add minimal admin endpoints (protected) to manage roles/permissions:
  - GET /api/permissions
  - GET /api/roles
  - POST /api/roles (create role with key/name/description)
  - POST /api/roles/:roleId/permissions (replace or add permissions)
  - POST /api/users/:userId/roles (assign roles)
  - POST /api/users/:userId/permissions (set overrides allow/deny)
- Keep DTO validation via class-validator and document with Swagger.
- Implement repositories and services in modules:
  - modules/roles (or access-control) and modules/permissions (or combined module "access-control")
  - Use repo pattern like existing modules (controller -> service -> repo -> prisma)

GUARDS + DECORATORS
- Implement a permissions system that works like:
  - @RequirePermissions("users.read", "roles.read") decorator (stores metadata)
  - PermissionsGuard reads required permissions from metadata, then checks if user has them:
      EffectivePermissions = (role permissions) + (user ALLOW overrides) - (user DENY overrides)
  - If missing => 403 with consistent error shape via existing filter.
- Keep existing jwt-auth.guard.ts for authentication; chain it with PermissionsGuard.
- Provide an example protected endpoint using @RequirePermissions in an existing controller (e.g., GET /api/roles uses "roles.read").

SCOPING (FUTURE-PROOFING)
- Design the code so we can later scope roles/permissions by resource (buildingId/orgId) without rewriting everything.
- Concretely: in the service/guard, keep an interface like:
    getUserEffectivePermissions(userId: string, context?: { orgId?: string; buildingId?: string })
  For now, ignore context but structure code to accept it.
- Do NOT implement building/org tables now.

PERFORMANCE
- Permission lookup should be efficient:
  - Use Prisma queries with includes/joins to fetch role permissions + overrides.
  - Add minimal caching per request (e.g., store computed permissions on request object) to avoid repeated DB calls.
  - Avoid global caches unless simple and safe.

TESTS
- Add unit tests for:
  - computing effective permissions with allow/deny overrides
  - guard behavior (allowed vs forbidden)
- Use jest; mock repo.

MIGRATIONS
- Create a Prisma migration for the new tables.
- Update README with how to migrate + seed.

OUTPUT
- Provide code changes for:
  - prisma/schema.prisma updates
  - prisma/seed.ts
  - new modules (access-control/roles/permissions) with controllers/services/repos/dtos
  - common/decorators/require-permissions.decorator.ts
  - common/guards/permissions.guard.ts updated to real implementation
  - updated auth strategy to attach userId/email (no permissions in JWT)
  - tests
  - package.json scripts
- Keep naming consistent with current project conventions.
- Do not invent business requirements beyond RBAC foundation.
