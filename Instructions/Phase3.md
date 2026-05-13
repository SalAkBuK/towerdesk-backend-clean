Context (already implemented)
- Phase 1: Org scoping foundation (Org, Building, User.orgId) with org-scope guard; orgId is derived from JWT/DB and enforced.
- Phase 2: Platform bootstrap creates Org Admin with mustChangePassword and change-password endpoint; /platform routes guarded by PLATFORM_API_KEY.
- Roles/RBAC exist (at least ORG_ADMIN). Org Admin is the top customer role.

Task: Implement Phase 3 — Buildings detail + Units CRUD (org-scoped), with strong validation + E2E tests.

Naming / concepts
- Use “Organization (org)” for the SaaS tenant. Use orgId for scoping.
- Use “Resident” for building tenant (end user). Do not use the word “tenant” in code.
- Units belong to a Building; Buildings belong to an Org.

Phase 3 deliverables

1) Prisma schema + migration
Add a Unit model:
- id (cuid/uuid)
- buildingId (FK -> Building.id)
- label (string)  // default unit identifier, e.g. "A-101"
- floor (int?) optional
- notes (string?) optional
- createdAt, updatedAt
Constraints / indexes:
- unique (buildingId, label)  // prevent duplicate unit labels within same building
- index on buildingId
Update schema.prisma + create a migration.

2) Org-scoped Building “detail” endpoints
Add endpoints under customer scope (/org/*), enforcing org scoping via existing guard and deriving orgId from req.user.orgId:
- GET /org/buildings/:buildingId
  - Returns building if it belongs to req.user.orgId, else 404 (do not leak existence).
Optional (if not already): PATCH /org/buildings/:buildingId (basic update name) and DELETE (can be omitted if you want minimal).
At minimum: implement GET detail.

3) Org-scoped Units endpoints
All units routes are building-scoped:
- POST /org/buildings/:buildingId/units
  - Body: { label: string, floor?: number, notes?: string }
  - Validate: building exists and belongs to req.user.orgId
  - Create unit linked to buildingId
  - Enforce label unique per building (handle Prisma unique error nicely)
- GET /org/buildings/:buildingId/units
  - Returns all units for that building if building belongs to org
  - Support basic pagination later (not required now)
Do NOT implement "available=true" yet (that will come with Occupancy in Phase 4), but structure the code so adding query filters later is easy.

4) Access control
- Require ORG_ADMIN for these endpoints (or the existing equivalent permission/guard).
- Org scoping must be enforced in every query:
  - Building lookup must include orgId
  - Unit list must be constrained to buildingId AND building.orgId via building check
- Never accept orgId from client inputs.

5) Code structure expectations
- Create a UnitsModule with controller/service/repo (or follow existing repo pattern).
- Keep controllers thin; put logic in services.
- Use DTOs with class-validator.
- Update Swagger decorators if project uses @nestjs/swagger.
- Implement consistent error handling:
  - 404 for building not found in org
  - 409 for duplicate unit label in same building
  - 400 for invalid payload

6) E2E tests
Add E2E tests similar to Phase 1/2 style:
- Org A admin can create building, then create units under it.
- Org B admin cannot:
  - GET Org A building detail (404)
  - POST units under Org A building (404)
  - GET units under Org A building (404)
- Duplicate unit label in same building returns 409.
- Invalid payload (missing label) returns 400.
Use test setup that creates two orgs + two org admins (using existing platform endpoints + PLATFORM_API_KEY in tests, or existing helpers).

7) README update
Add short notes:
- How to create a building then units
- Example curl/httpie for endpoints
- Mention that availability filtering will be added in Phase 4 (Occupancy)

Output requirements
- Provide code changes: prisma schema + migration + Nest modules/controllers/services/repos/DTOs + E2E tests + README update.
- Ensure login/refresh responses remain 200 (existing semantics).
- Keep changes minimal and additive.

Now implement Phase 3.






