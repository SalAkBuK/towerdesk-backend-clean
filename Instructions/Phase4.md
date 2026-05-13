You are working in a NestJS + TypeScript backend with Prisma + PostgreSQL.

Context (already implemented)
- Phase 1: Org scoping foundation (Org, Building, User.orgId) with org-scope guard; orgId derived from JWT/DB.
- Phase 2: Platform bootstrap creates Org Admin with mustChangePassword; auth change-password exists; /platform routes protected by PLATFORM_API_KEY.
- Phase 3: Building detail endpoint + Units CRUD (Unit model) under org scoping; RBAC permissions exist for buildings/units.

Task: Implement Phase 4 — Building Assignments (Manager/Staff) + Occupancy (Resident ↔ Unit) + available unit filtering.

Key concepts / naming
- Organization (org) is the SaaS tenant; all customer data is scoped by orgId.
- Use “Resident” for building tenant (end user). Avoid “tenant” in code.
- Managers/Staff are users assigned to buildings to manage/execute jobs.
- Occupancy links a Resident user to a Unit in a Building.
- “Available unit” means: Unit in this building with NO ACTIVE occupancy.

Phase 4 deliverables

A) Building Assignments (Manager/Staff)

1) Prisma schema + migration
Add a BuildingAssignment model:
- id (cuid/uuid)
- buildingId (FK -> Building.id)
- userId (FK -> User.id)
- type enum: MANAGER | STAFF
- createdAt, updatedAt
Constraints / indexes:
- unique (buildingId, userId, type)  // prevent duplicates
- index on buildingId
- index on userId

2) Endpoints (org-scoped, RBAC protected)
Under /org/buildings/:buildingId:
- POST /org/buildings/:buildingId/assignments
  Body DTO: { userId: string, type: "MANAGER" | "STAFF" }
  Rules:
  - Building must exist and belong to req.user.orgId; else 404
  - Target user must exist, be ACTIVE, and have orgId == req.user.orgId; else 400/404 (prefer 400 with message "User not in org")
  - Create assignment; on duplicate return 409 with clean message
- GET /org/buildings/:buildingId/assignments
  Returns assignments for that building (include assigned user basic fields: id, name, email)

RBAC:
- Restrict to ORG_ADMIN for now (simple). Add permission keys and seed them:
  - building.assignments.read
  - building.assignments.write

B) Occupancy + available units

3) Prisma schema + migration
Add an Occupancy model:
- id (cuid/uuid)
- buildingId (FK -> Building.id)  // denormalized for fast queries
- unitId (FK -> Unit.id)
- residentUserId (FK -> User.id)
- status enum: ACTIVE | ENDED
- startAt (DateTime default now)
- endAt (DateTime nullable)
- createdAt, updatedAt
Constraints / indexes:
- index on buildingId
- index on unitId
- index on residentUserId
Business rule:
- Only one ACTIVE occupancy per unit.
Implement this rule in service-level logic using a transaction:
  - Before creating ACTIVE occupancy, check no ACTIVE occupancy exists for unitId.
  - If exists, return 409 "Unit is already occupied".

4) Enhance Units listing to support availability filter
Update Phase 3 units list endpoint:
- GET /org/buildings/:buildingId/units?available=true
Behavior:
- If available=true:
  - Return units in that building that do NOT have an ACTIVE occupancy.
- If available not provided:
  - Return all units for the building.
Implementation approach:
- Use a single query where possible (e.g., NOT EXISTS / left join style via Prisma relations).
- Must still enforce building belongs to req.user.orgId (404 if not found).

5) (Optional but recommended) Occupancy read endpoint
Add:
- GET /org/buildings/:buildingId/occupancies
  - Returns active occupancies for building, include unit label + resident basic fields.
This helps the building detail UI later.
If time is tight, you may skip this, but ensure the model supports it.

RBAC:
- Restrict to ORG_ADMIN for now and seed permissions:
  - occupancy.read
  - occupancy.write

C) E2E tests

6) E2E coverage
Add tests similar to existing Phase 1–3 style:
Assignments:
- Org A admin creates building + creates a normal user in Org A (helper or factory) then assigns as MANAGER; list returns it.
- Org B admin cannot GET/POST assignments under Org A building (404).
- Cannot assign a user from another org (400).
- Duplicate assignment returns 409.

Occupancy / availability:
- Setup: create building + 2 units.
- Initially: GET units?available=true returns both.
- Create resident user in same org and create ACTIVE occupancy for unit1 (you may create occupancy via direct repo/service call in test or add a minimal endpoint POST /org/buildings/:buildingId/occupancies for tests; prefer adding a real endpoint).
- After occupancy: GET units?available=true returns only unit2.
- Cross-org access: Org B cannot query units availability for Org A building (404).
- Attempt second occupancy ACTIVE for same unit returns 409.

If you add POST occupancy endpoint:
- POST /org/buildings/:buildingId/occupancies
  Body: { unitId, residentUserId }
  Rules: unit belongs to building; resident user belongs to org; enforce single ACTIVE occupancy.

D) README update

7) Document Phase 4 usage
- Example curl for assignments endpoints
- Example curl for available unit listing
- Mention occupancy model and that resident onboarding will be Phase 5.

Implementation notes
- Keep org scoping consistent: always load building with orgId filter; return 404 when not in org.
- Never accept orgId from client.
- Use DTOs + class-validator.
- Use Prisma transactions for occupancy creation.
- Keep controllers thin; logic in services; repo pattern consistent with existing code.
- Surface clean error messages for 409/400 responses.
- Update seed.ts to include new permissions and map them to ORG_ADMIN.

Output requirements
- Provide code changes: prisma schema + migration + modules/controllers/services/repos/DTOs + E2E tests + README update.
- Run tests and note commands used.

Now implement Phase 4.
