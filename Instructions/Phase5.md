You are working in a NestJS + TypeScript backend with Prisma + PostgreSQL.

Context (already implemented)
- Org scoping is enforced (req.user.orgId derived from DB/JWT). Cross-org resources return 404.
- Global RBAC exists: users can have multiple roles; effective permissions are union of role permissions with per-user ALLOW/DENY overrides. RBAC is GLOBAL only (no resource scoping).
- Phase 3: Building detail + Units CRUD (org-scoped) with RBAC permission keys.
- Phase 4: BuildingAssignment (MANAGER/STAFF) + Occupancy (ACTIVE/ENDED), and units?available=true.

Problem
- BuildingAssignment and Occupancy currently do NOT influence authorization. Only global RBAC permissions decide access.
- We need resource-scoped authorization for building-scoped routes: allow access based on (a) org ownership, then (b) global RBAC permission OR building assignment OR resident occupancy (for resident routes).

Task: Implement building-scoped authorization (minimal change)

Deliverables

1) Schema change (minimal)
- Extend BuildingAssignmentType enum to include BUILDING_ADMIN.
  - MANAGER | STAFF | BUILDING_ADMIN
- Migration included.
- Update any DTO validations and service logic to accept BUILDING_ADMIN.

2) Authorization helper + guard
Create a reusable building access helper/service and a guard:

A) BuildingAccessService (or similar)
Implement methods:
- assertBuildingInOrg(buildingId, orgId): returns Building or throws 404
- getBuildingAssignmentType(buildingId, userId): returns assignment type or null
- hasActiveOccupancy(buildingId, userId): boolean
- canReadBuildingResource(user, buildingId): boolean
- canWriteBuildingResource(user, buildingId): boolean

Policy (implement exactly):
- Always enforce org ownership first:
  - Load Building with { id: buildingId, orgId: req.user.orgId }
  - If not found => 404 (do not leak existence)
- Then evaluate:
  READ access allowed if ANY:
    - user has global permission key required for this route (via existing AccessControlService)
    - OR user has BuildingAssignment for that building of type in { STAFF, MANAGER, BUILDING_ADMIN }
    - OR (for resident-allowed routes only) user has ACTIVE occupancy in that building
  WRITE access allowed if ANY:
    - user has global permission key required for this route
    - OR user has BuildingAssignment type BUILDING_ADMIN (optionally include MANAGER for certain ops if explicitly desired; default: BUILDING_ADMIN only)

B) BuildingAccessGuard
- The guard should:
  - Extract buildingId from route params (support :buildingId and also routes like /org/buildings/:buildingId/*)
  - Call org ownership check (404 if not in org)
  - Then check either READ or WRITE based on metadata.
- Implement decorators for metadata:
  - @BuildingReadAccess()
  - @BuildingWriteAccess()
  These set required access level for the guard.
- Additionally, integrate with existing @RequirePermissions(...) if present:
  - If a route declares a permission key, global permission should still grant access even without assignment.

3) Wire guard into building-scoped routes
Apply BuildingAccessGuard to routes that should be scoped to a specific building:

- Buildings:
  - GET /org/buildings/:buildingId  => READ
  - (if PATCH/DELETE exist) => WRITE
- Units:
  - GET /org/buildings/:buildingId/units and ?available=true => READ
  - POST /org/buildings/:buildingId/units => WRITE
- Assignments:
  - GET /org/buildings/:buildingId/assignments => READ
  - POST /org/buildings/:buildingId/assignments => WRITE
- Occupancies:
  - GET /org/buildings/:buildingId/occupancies (if exists) => READ
  - POST /org/buildings/:buildingId/occupancies => WRITE
Keep behavior: cross-org returns 404.

IMPORTANT: Do NOT remove global RBAC checks. The building guard should ADD an alternate path to authorization via building assignment/occupancy when global permission is absent.

4) Permissions / roles
- Keep existing global permission keys as-is.
- Do NOT create a new “scoped permission table” in this phase.
- Ensure ORG_ADMIN role still works globally via RBAC permissions.
- BUILDING_ADMIN should be purely via BuildingAssignment and should grant building-level write access even if user lacks global RBAC keys.

5) E2E tests (must add)
Create E2E tests proving the new behavior:

Setup:
- Org A with:
  - Building A1
  - Units under A1
  - Users:
    - orgAdminA (global ORG_ADMIN)
    - staffA (no global permissions besides login)
    - managerA (no global permissions besides login)
    - buildingAdminA (no global permissions besides login)
    - residentA (no global permissions besides login + ACTIVE occupancy in A1)
- Org B with:
  - orgAdminB and Building B1 (to test cross-org 404)

Tests:
1) Cross-org isolation remains:
  - orgAdminB cannot access Org A building routes (404).
2) Global org admin bypass:
  - orgAdminA can READ/WRITE any building resources in Org A.
3) Building assignment-based access:
  - staffA assigned STAFF to A1:
    - can GET building detail and GET units list (READ allowed)
    - cannot POST unit or POST assignment (WRITE denied -> 403)
  - buildingAdminA assigned BUILDING_ADMIN to A1:
    - can POST unit / POST assignment / POST occupancy (WRITE allowed)
4) Resident occupancy access (resident-allowed endpoints only):
  - residentA with ACTIVE occupancy in A1:
    - can access READ endpoints that you explicitly mark as resident-allowed (choose at least one, e.g., GET /org/buildings/:buildingId/units or a dedicated resident route; if current routes are admin-facing only, then DO NOT grant occupancy-based access there yet—create a small resident-safe endpoint like GET /org/buildings/:buildingId/units/basic or similar and test that).
5) Ensure 404 happens before 403:
  - A user from Org A with no assignment must not learn about Org B building; should be 404, not 403.

6) README update
- Document that building-scoped routes are authorized by:
  - global RBAC permissions OR building assignment types
- Clarify BUILDING_ADMIN vs MANAGER/STAFF behavior.

Implementation notes
- Keep controllers thin.
- Prefer using a single place (BuildingAccessService) so authorization rules don’t get duplicated across services.
- Use transactions only where needed (not for auth checks).
- Ensure error semantics:
  - 404 for building not in org
  - 403 for in-org but insufficient access

Output requirements
- Provide code changes: schema + migration + guard/service + decorators + wiring + tests + README updates.
- Run tests and note commands used.

Now implement this building-scoped authorization.
