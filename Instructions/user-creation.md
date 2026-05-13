You are Codex. Work in a NestJS + Prisma + Postgres codebase.

Goal
Add a new “one-stop” endpoint to provision (create-or-link) a user and apply any combination of:
- global org roles (admin/org_admin/viewer/etc via roleKeys)
- building assignments (MANAGER/STAFF/BUILDING_ADMIN per building)
- resident occupancy (unit resident in a building)
A user may simultaneously be resident + staff + org admin (no mutual exclusivity).

Hard requirements
- Single new endpoint: POST /api/org/users/provision
- Atomic: everything runs in ONE Prisma transaction (all-or-nothing).
- Idempotent: repeated calls with same payload must not create duplicates.
- Backwards compatible: do NOT break existing endpoints:
  - POST /api/users
  - POST /api/users/:userId/roles
  - POST /api/org/buildings/:buildingId/assignments
  - POST /api/org/buildings/:buildingId/residents
- Keep existing concepts: global roles are via roleKeys; building roles are via BuildingAssignment; residents via Occupancy.
- Implement in a clean, testable service (controller thin, service owns logic).

Assumptions / defaults (use unless the repo contradicts)
- There is an org/tenant context already (e.g., request.orgId or similar). Enforce requireSameOrg = true by default.
- Emails are unique per org (if schema is global-unique, adapt accordingly).
- Building assignment model: one assignment per (userId, buildingId). If repo uses (userId, buildingId, type), adapt.
- Occupancy: allow multiple active occupancies per user across units (unless existing schema forbids it). Ensure no duplicate active occupancy for same (userId, unitId).

API contract
POST /api/org/users/provision
Request JSON:
{
  "identity": {
    "email": "jane@org.com",
    "name": "Jane Admin",
    "password": "optional",
    "sendInvite": true
  },
  "grants": {
    "orgRoleKeys": ["admin", "org_admin"],
    "buildingAssignments": [
      { "buildingId": 14, "type": "MANAGER" },
      { "buildingId": 15, "type": "STAFF" }
    ],
    "resident": { "buildingId": 14, "unitId": 991, "mode": "ADD" }
  },
  "mode": {
    "ifEmailExists": "LINK",     // LINK | ERROR
    "requireSameOrg": true,
    "atomic": true,
    "idempotent": true
  }
}

Response JSON (structure can vary but include these fields):
{
  "user": { "id": "...", "email": "...", "name": "..." },
  "created": true|false,
  "linkedExisting": true|false,
  "applied": {
    "orgRoleKeys": [...],
    "buildingAssignments": [...],
    "resident": { "occupancyId": "...", "unitId": 991, "buildingId": 14 }
  }
}

Validation rules
- email required, normalized/lowercased.
- If creating new user, require either password OR sendInvite=true (depending on existing auth patterns).
- roleKeys must exist in Role table; reject unknown keys with 400.
- For each building assignment:
  - building must exist and belong to the caller’s org (if org scoping exists).
  - upsert assignment idempotently (update type if exists under the “one assignment per building” model).
- For resident grant:
  - unit must exist
  - unit.buildingId must equal resident.buildingId
  - building must exist and belong to org (if scoped)
  - create occupancy if not already active for (userId, unitId); if exists, treat as no-op
  - If mode is MOVE and there is an existing active occupancy in another unit for that user AND the schema expects single-active, then end old occupancy and create new (only implement MOVE if schema supports endedAt or status; otherwise ignore MOVE or return 400).
- Entire operation must run in a Prisma transaction.

Implementation steps
1) Create DTOs with class-validator:
   - ProvisionUserDto, IdentityDto, GrantsDto, BuildingAssignmentGrantDto, ResidentGrantDto, ModeDto
2) Add OrgUsersProvisionController (or similar) under an org module:
   - POST /api/org/users/provision -> service.provision(dto, requestContext)
3) Add OrgUsersProvisionService:
   - Start prisma.$transaction(async (tx) => { ... })
   - Resolve orgId and enforce requireSameOrg if applicable
   - Find existing user by email (within org scope if applicable)
     - if exists and ifEmailExists=ERROR => throw ConflictException
     - else create user (hash password if provided; otherwise create per existing invite/pending user flow)
   - Apply org roles:
     - For each roleKey: lookup Role by key; upsert UserRole (unique on userId+roleId)
   - Apply building assignments:
     - For each grant: validate building exists and org match
     - Upsert assignment:
       - If repo uses unique(userId, buildingId): upsert and set type
       - Else if unique(userId, buildingId, type): create if missing; do not duplicate
   - Apply resident occupancy:
     - Validate unit and building match and org match
     - Create occupancy if not active exists
   - Return structured response with created/linkedExisting/applied
4) Add Swagger decorators for the new endpoint.
5) Add tests:
   - happy path create new user with all grants
   - idempotent repeat returns same user and does not duplicate roles/assignment/occupancy
   - unknown roleKey -> 400
   - unit/building mismatch -> 400
   - ifEmailExists=ERROR + existing email -> 409
   - assignment upsert updates type (if using unique(userId, buildingId))
6) Add/adjust Prisma constraints ONLY if missing and safe:
   - ensure UserRole unique(userId, roleId)
   - ensure BuildingAssignment unique per intended model
   - ensure occupancy has a way to prevent duplicates (at least at app level if DB cannot express partial unique for active rows)

Notes
- Do not refactor existing endpoints; only add new ones. But you may reuse internal services already used by existing endpoints.
- Follow existing repo patterns for modules, guards, request context typing, and error handling.
- Keep code clean and minimal; no speculative features.
- Ensure TypeScript compilation passes and tests pass.

Deliverables
- New controller + service + DTOs
- Any required module wiring
- Prisma changes only if necessary and safe
- Tests
