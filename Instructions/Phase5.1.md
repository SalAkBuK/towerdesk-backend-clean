You are working in a NestJS + TypeScript backend with Prisma + PostgreSQL.

Context (already implemented)
- Org scoping: req.user.orgId derived from DB/JWT; cross-org resources return 404.
- Global RBAC (roles/permissions + allow/deny overrides) is GLOBAL only.
- Building-scoped authorization exists via BuildingAccessGuard/Service:
  - Always checks building { id, orgId } first -> 404 if not found
  - Then allows via: global RBAC permission OR building assignment type
  - BUILDING_ADMIN added to BuildingAssignmentType
  - Resident-safe endpoint exists (/units/basic) and occupancy-based access is only allowed where explicitly intended
- Units CRUD + occupancy model exists; units?available=true works; occupancy create prevents double-active occupancy.
- Phase 2 platform bootstrap: /platform routes guarded by PLATFORM_API_KEY; creates org admin with mustChangePassword; simple temp passwords (no email/invite tokens).

NEW POLICY UPDATE (important)
- Managers should be able to READ by building assignment as before.
- Managers should be able to WRITE ONLY IF they have the relevant GLOBAL RBAC permission key granted by an ORG_ADMIN.
  - I.e., building assignment alone does NOT see “write”; write is gated by permission keys.
  - BUILDING_ADMIN assignment may still grant write as a shortcut where desired, but for manager write: require permission keys.

Task: Implement Phase 5 — Resident onboarding + building residents listing, using available units selection; integrate manager write rule where relevant.

Phase 5 deliverables

A) Resident onboarding endpoints (org-scoped)

1) Add endpoint: POST /org/buildings/:buildingId/residents
Purpose:
- Org Admin (and optionally managers with explicit permission) can onboard a Resident into a specific building/unit.
Flow:
- UI will call GET /org/buildings/:buildingId/units?available=true to show available units.
- Admin selects a unit and submits resident details.

Request body DTO:
- { name: string, email: string, password?: string, unitId: string }
Behavior:
- Enforce building in org first (404 if not in org)
- Validate:
  - unitId belongs to buildingId (400 if mismatch)
  - unit is available (no ACTIVE occupancy) (409 if occupied)
  - email uniqueness (follow existing policy: global unique email preferred; if per-org, enforce per-org)
- Create Resident user + occupancy atomically in one Prisma transaction:
  - Create User with orgId=req.user.orgId
  - Assign a global role like RESIDENT (if roles exist) but do not rely on it for building access
  - Password:
    - If password provided: hash it
    - Else generate strong temp password and return it in response
  - Set mustChangePassword=true for residents created this way
  - Create ACTIVE Occupancy linking:
    - buildingId, unitId, residentUserId
- Response DTO:
  - { userId, name, email, unit: { id, label }, buildingId, tempPassword?: string, mustChangePassword: true }

Authorization for POST /residents:
- Default: allow ORG_ADMIN via global permission (e.g., residents.write).
- Also allow MANAGER to perform this ONLY if they have the global RBAC permission key residents.write (explicitly granted).
- Do NOT allow STAFF by default.
- Do NOT allow assignment-only write (except BUILDING_ADMIN if your current BuildingAccessService treats that as write-allow; keep BUILDING_ADMIN allow if already designed).

Implementation note:
- Use existing BuildingAccessGuard with WRITE access and a required permission key (residents.write).
- Ensure the “manager can write if given permission” policy is enforced:
  - Either: in the guard/service, write requires permission unless assignment is BUILDING_ADMIN or ORG_ADMIN.
  - Or: for this endpoint, require permission check explicitly (do not rely solely on assignment type).

2) Add endpoint: GET /org/buildings/:buildingId/residents
Purpose:
- List residents for a building (for building details UI).
Return each resident with:
- user id, name, email
- unit id + label
- occupancy status (ACTIVE/ENDED)
- startAt/endAt
Authorization:
- READ access:
  - ORG_ADMIN OR
  - BuildingAssignment STAFF/MANAGER/BUILDING_ADMIN (read)
  - For resident-facing endpoints, do not expose this route; this is admin/ops only.

B) Permission keys + seeding

3) Add permissions and map to ORG_ADMIN:
- residents.read
- residents.write
Seed them and map them to ORG_ADMIN.
Managers can get residents.write only if admin assigns it (do not auto-assign).

C) Manager write rule (global permission required)
4) Update building-scoped authorization policy implementation:
- READ: global permission OR assignment type in {STAFF, MANAGER, BUILDING_ADMIN}
- WRITE: allow if:
  - has required global permission key
  - OR assignment type is BUILDING_ADMIN
  - OR user is ORG_ADMIN (via global permission anyway)
This ensures “manager write only if granted permission”.

D) E2E tests

5) Add E2E suite for resident onboarding
Setup:
- Org A with building A1 and units U1, U2
- Users:
  - orgAdminA (has residents.write)
  - managerA assigned MANAGER to A1 (no residents.write by default)
  - buildingAdminA assigned BUILDING_ADMIN to A1
  - staffA assigned STAFF to A1
  - orgAdminB + building B1 for cross-org 404

Tests:
1) Org admin can onboard resident:
  - POST /org/buildings/A1/residents with unitId=U1 -> 201/200 OK
  - Response includes mustChangePassword=true, and tempPassword if not provided
  - GET residents list shows resident + unit label
  - GET units?available=true now excludes U1
2) Unit mismatch:
  - Using unit from another building returns 400
3) Occupied unit:
  - Second resident onboarding to same unit returns 409
4) Manager cannot write by assignment alone:
  - managerA POST /residents returns 403
5) Manager can write if granted permission:
  - Grant managerA global permission residents.write (via test helper inserting UserPermissionOverride ALLOW or assigning a role with that permission)
  - managerA POST /residents succeeds
6) BUILDING_ADMIN can write without permission (if policy allows):
  - buildingAdminA POST /residents succeeds even without residents.write (or if you choose to require permission for everyone except ORG_ADMIN, then reflect that; default: BUILDING_ADMIN bypass allowed)
7) STAFF cannot write:
  - staffA POST /residents returns 403
8) Cross-org:
  - orgAdminB cannot POST/GET residents in Org A building (404)

Also include Windows Prisma note: do not rely on prisma:generate during tests if engine is locked; but CI should run on Linux.

E) README update
6) Document:
- Resident onboarding flow
- endpoints + sample curl
- mustChangePassword behavior
- manager write requires explicit permission granted by admin
- clarify BUILDING_ADMIN vs MANAGER

Output requirements
- Provide code changes: controllers/services/repos/DTOs + prisma migration + seed update + E2E tests + README update.
- Run tests and note commands.

Now implement Phase 5.
