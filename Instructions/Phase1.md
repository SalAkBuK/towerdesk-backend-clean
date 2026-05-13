You are working in a Node.js + TypeScript backend (NestJS preferred) using Prisma + PostgreSQL.

Task: Implement Phase 1 — Multi-tenant Organization (org_id) foundation with strict data scoping.

Core rule
- “Organization” (org) = customer/company using the software.
- “Resident” = building tenant (end user). Do NOT call residents “tenants” in code.
- Use org_id (or company_id). Avoid naming it tenant_id to prevent confusion.
- All customer data must be isolated by org_id.

Important: Superadmin is internal (developers/platform operators)
- Superadmin is NOT a customer role.
- Superadmin does NOT belong to an org.
- Superadmin endpoints must be separated and environment-gated (optional in this phase, but do not mix platform concepts into org-scoped flows).

Phase 1 deliverables
1) Database / Prisma schema updates
- Add model Org:
  - id (uuid/cuid), name, createdAt, updatedAt
- Update User model:
  - orgId nullable for platform users (future), but required for all customer users.
  - relation: User -> Org
- Add model Building (minimal, for scoping sanity checks):
  - id, orgId, name, createdAt, updatedAt
- Ensure relations:
  - Org has many Users
  - Org has many Buildings
- Add indexes:
  - User.orgId
  - Building.orgId
- Migration included.

2) Request context and scoping
- Ensure authenticated requests have req.user with:
  - userId
  - orgId (required for customer roles)
  - roles/permissions (if existing)
- Create a reusable scoping helper that forces org scoping in all queries, e.g.:
  - function assertOrgScope(user): returns orgId or throws
  - guard or interceptor that rejects requests where orgId is missing for org-scoped routes

3) Update/introduce minimal endpoints to prove scoping
Implement these endpoints:
A) Platform bootstrap (internal only — simple for now)
- POST /platform/orgs
  - body: { name: string }
  - creates an Org
  - NOTE: in this phase you may stub auth check with an env flag (e.g. require x-platform-key header or NODE_ENV check). Keep it separated under /platform.
B) Org-scoped endpoints (customer area)
- POST /org/buildings
  - creates building under req.user.orgId
- GET /org/buildings
  - returns only buildings where building.orgId == req.user.orgId

4) Scoping enforcement requirements
- Do NOT accept orgId from client for org-scoped endpoints.
- Always derive orgId from req.user.orgId.
- Every Prisma query for org-scoped models must include orgId filter.
- If user has no orgId (platform user), org-scoped endpoints must return 403.

5) Seed / dev data (minimal)
- Add a seed script or simple instructions to create:
  - one Org
  - one Org Admin user linked to that Org (if user creation exists already)
  - at least one Building linked to the Org

6) Tests (light but meaningful)
- Add 2–3 integration tests:
  - org-scoped list only returns records for that org
  - cannot access org endpoints without orgId
  - cannot create a building for a different org (because orgId is derived from token)

Implementation notes
- Keep changes minimal and additive.
- Do not redesign the entire RBAC system in this phase.
- Focus on the foundation: org model, orgId fields, enforced scoping, and proof endpoints.
- Use class-validator DTOs for inputs.
- Update Swagger decorators if the project already uses @nestjs/swagger.

Output requirements
- Provide code changes (Prisma schema + migrations + Nest modules/controllers/services/guards + tests).
- Include short README notes on how to run migration + seed + tests.

Now implement Phase 1.
