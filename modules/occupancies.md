# Occupancies Review

## Scope

- Source: `src/modules/occupancies`
- Main files:
  - `occupancies.controller.ts`
  - `occupancies.service.ts`
  - `occupancies.repo.ts`
  - `dto/create-occupancy.dto.ts`
  - `dto/list-occupancies.query.dto.ts`
  - `dto/occupancy.response.dto.ts`
- Public routes:
  - `POST /org/buildings/:buildingId/occupancies`
  - `GET /org/buildings/:buildingId/occupancies`
  - `GET /org/buildings/:buildingId/occupancies/count`
- Core responsibility: create and expose building-scoped occupancy records that represent which resident is actively occupying which unit.

## What This Module Really Owns

- Direct creation of occupancy records through the explicit occupancy API.
- Building-scoped occupancy listing and active-count reporting.
- The runtime invariant that:
  - one unit can have only one active occupancy
  - one resident can have only one active occupancy
- The basic read model used by other modules when they need to answer:
  - who currently lives in this unit
  - which unit is this resident currently attached to
  - does this building currently have an active tenant in this unit

## Important Architectural Note

This module does not fully own the occupancy lifecycle.

It exposes create, list, and count, but active occupancies are also created or ended in other modules:

- `users/org-user-lifecycle.service.ts`
  - resident grant modes `ADD`, `MOVE`, `MOVE_OUT`
- `leases/lease-lifecycle.service.ts`
  - lease move-in creates occupancy
  - lease move-out ends occupancy

That means the `Occupancy` table is a shared business primitive, while this module is only one entry point into it.

For review purposes, that is the most important fact to keep in mind.

## Step-By-Step Request Flows

### 1. Create occupancy

1. Controller accepts `POST /org/buildings/:buildingId/occupancies`.
2. `JwtAuthGuard`, `OrgScopeGuard`, and `BuildingAccessGuard` run at controller level.
3. Route requires:
   - `@BuildingWriteAccess()`
   - `@RequirePermissions('occupancy.write')`
4. Service derives `orgId` from authenticated scope with `assertOrgScope(...)`.
5. Service verifies the target building belongs to the same org.
6. Service loads the target unit using `findByIdForBuilding(buildingId, dto.unitId)`.
7. If the unit is not in that building, request fails with `BadRequestException('Unit not in building')`.
8. Service loads the resident user by id.
9. User must:
   - exist
   - be active
   - belong to the same org
10. Service performs application-level prechecks:
    - active occupancy already on the unit
    - active occupancy already for the resident
11. If either precheck fails, request returns conflict:
    - `Unit is already occupied`
    - `Resident already occupying a unit`
12. Repo creates the occupancy with:
    - `status = ACTIVE`
    - `endAt = null`
    - database default `startAt = now()`
13. Service catches Prisma constraint errors and maps them again through `mapOccupancyConstraintError(...)`.
14. Response includes unit summary and resident summary.

### 2. List occupancies for a building

1. Controller accepts `GET /org/buildings/:buildingId/occupancies`.
2. Same controller-level guards run.
3. Route requires:
   - `@BuildingReadAccess()`
   - `@RequirePermissions('occupancy.read')`
4. Service verifies the building exists in the caller's org.
5. Query defaults are applied:
   - `status = ACTIVE`
   - `sort = createdAt`
   - `order = desc`
6. Optional filters are parsed:
   - `status = ACTIVE | ENDED | ALL`
   - `q`
   - `cursor`
   - `limit`
   - `sort`
   - `order`
   - `includeProfile`
7. If `cursor` exists, service decodes base64 JSON payload and validates it.
8. Repo builds a Prisma query scoped to `buildingId`.
9. Search `q` matches:
   - resident name
   - resident email
   - unit label
10. Sorting supports:
    - `createdAt`
    - `startAt`
    - `residentName`
    - `unitLabel`
11. Cursor pagination is keyset-style, not offset-style.
12. Service fetches `limit + 1` rows when paginating so it can detect whether more rows exist.
13. If there is another page, service emits `x-next-cursor`.
14. Response returns mapped occupancy DTOs.

### 3. Count active occupancies

1. Controller accepts `GET /org/buildings/:buildingId/occupancies/count`.
2. Caller needs building-read access plus `occupancy.read`.
3. Service verifies building membership in current org.
4. Repo counts only `ACTIVE` occupancies for that building.
5. Response shape is `{ active: number }`.

## Data And State Model

### Occupancy table shape

- `id`
- `buildingId`
- `unitId`
- `residentUserId`
- `status`
  - `ACTIVE`
  - `ENDED`
- `startAt`
- `endAt`
- `createdAt`
- `updatedAt`

### Database invariants

The strongest occupancy rules are enforced in the database, not only in service code.

- Unique partial index: `uniq_active_occupancy_per_unit`
  - only one `ACTIVE` occupancy per `unitId`
- Unique partial index: `uniq_active_occupancy_per_resident`
  - only one `ACTIVE` occupancy per `residentUserId`
- Check constraint: `occupancy_status_endat_consistency`
  - `ACTIVE` requires `endAt IS NULL`
  - `ENDED` requires `endAt IS NOT NULL`

### Response model

The read DTO exposes more than just occupancy linkage.

- occupancy core fields
- embedded unit summary
- embedded resident summary
- optional embedded resident profile fields when `includeProfile=true`

That means this module is not only state storage. It is also a tenant-directory surface.

## Access Model

### Create

- Requires authenticated org-scoped user.
- Requires building write access.
- Requires explicit `occupancy.write` permission.

### List and count

- Require authenticated org-scoped user.
- Require building read access.
- Require explicit `occupancy.read` permission.

### Important implication

This module is not a generic org-wide occupancy API.

It is intentionally building-scoped, which matches how building managers and staff are granted access elsewhere in the system.

## Edge Cases And Important Scenarios

### 1. Unit/building mismatch

- The route path contains `buildingId`, but the unit comes from the body.
- Service explicitly verifies the unit belongs to that building.
- This blocks accidental or malicious cross-building occupancy creation.

### 2. Resident exists but is inactive

- `usersRepo.findById(...)` can return a user record that is inactive.
- Inactive users are rejected as `Resident not in org`.
- This is slightly broad wording, but the behavior is correct.

### 3. Resident belongs to another org

- Existence alone is not enough.
- Occupancy creation requires `resident.orgId === currentOrgId`.

### 4. Two requests race to occupy the same unit

- Service performs prechecks first.
- That alone is not sufficient under concurrency.
- Database partial unique indexes provide the real guarantee.
- Constraint errors are mapped back to clean API conflicts.

### 5. Two requests race to place the same resident in two units

- Same pattern as above.
- Service prechecks improve UX.
- Database constraint is the final source of truth.

### 6. Listing defaults to active only

- If the caller omits `status`, ended occupancy history is hidden.
- This is good for operational screens, but teams must remember history is not shown by default.

### 7. `ALL` mixes active and ended records

- The API supports `status=ALL`.
- Reviewers should verify whether downstream consumers understand they may get mixed lifecycle states in one list.

### 8. `includeProfile=true` expands PII surface

- The response can include:
  - Emirates ID number
  - passport number
  - nationality
  - date of birth
  - current address
  - emergency contact details
- This is useful operationally, but it raises access-review and logging sensitivity.

### 9. No direct "end occupancy" route

- This module creates occupancy records but does not end them.
- Ending happens through resident lifecycle and lease lifecycle flows elsewhere.
- Operationally, that means support teams may expect a simple occupancy-close route that does not exist.

### 10. Building delete cascades

- `Occupancy` belongs to `Building`, `Unit`, and `User` with cascade relationships.
- Deleting one of those roots can remove occupancy history.
- If history retention matters, this deserves review.

## Cross-Module Dependencies

### Residents / user provisioning

- `OrgUserLifecycleService` creates or ends occupancies during:
  - resident add
  - resident move
  - resident move-out
- This is effectively an alternate occupancy lifecycle API.

### Leases

- Lease move-in creates occupancy.
- Lease move-out ends occupancy and also ends parking allocations linked to that occupancy.
- Occupancy therefore acts as the tenant-presence anchor for lease lifecycle.

### Access projection

- `UserAccessProjectionService` looks at occupancy records to compute resident occupancy status:
  - `ACTIVE`
  - `FORMER`
  - `NONE`

### Visitors

- Resident visitor creation derives resident building and unit from active occupancy.
- No active occupancy means the resident visitor flow can fail with conflict.

### Parking

- Parking allocations can attach directly to `occupancyId`.
- Ending occupancy is therefore not only a resident-state change; it affects parking lifecycle too.

### Owner portfolio / maintenance / messaging / notifications

- Several modules query occupancy to resolve current tenant, unit context, eligibility, or visibility.
- The occupancy table is part of the runtime truth graph for resident-facing behavior.

## Strengths

- Small, clear API surface.
- Good layered validation:
  - org/building existence
  - unit-in-building validation
  - resident-in-org validation
  - service-level conflict checks
  - database-level invariant enforcement
- Cursor pagination is better than offset pagination for mutable datasets.
- Search and sort options are practical for operations teams.
- Constraint mapping is already explicit and tested.

## Risks And Design Weaknesses

### 1. Lifecycle ownership is fragmented

- This module looks like it owns occupancy, but it does not.
- Create and end behavior are spread across occupancy, users, and leases.
- That makes the business lifecycle harder to document and easier to drift.

### 2. No explicit transfer / close API in the occupancy module

- There is no native route for:
  - end occupancy
  - transfer occupancy
  - correct erroneous occupancy
- Those operations exist only indirectly through other modules.
- That creates operational coupling and may complicate admin tooling.

### 3. PII exposure is hidden behind a query flag

- `includeProfile=true` changes the sensitivity level of the response substantially.
- This is convenient, but it should be reviewed carefully against role expectations and audit needs.

### 4. Search/sort pagination on related fields can get expensive

- Sorting by `residentName` or `unitLabel` requires relation-aware ordering and cursor logic.
- This is fine at moderate scale, but it is less cheap than simple indexed timestamp ordering.

### 5. Occupancy history retention depends on hard-delete choices elsewhere

- Because relations use cascade deletes, occupancy history can disappear when root data is deleted.
- That may be acceptable operationally, but it weakens long-term auditability.

### 6. The route-level surface understates business criticality

- The module only has three endpoints.
- In practice, occupancy state drives resident permissions, resident flows, visitor creation, lease validity assumptions, and parking context.
- Small API surface does not mean low architectural importance.

## Improvement Opportunities

### High priority

- Decide which module truly owns occupancy lifecycle and document it explicitly.
- Add explicit occupancy-close and occupancy-transfer operations, or document why lease/user flows remain the only valid mutation paths.
- Review whether `includeProfile=true` should require stronger permissioning or an audit trail.

### Medium priority

- Add a dedicated occupancy history/timeline view if operations teams need to explain who lived where and when.
- Add stronger observability around occupancy create/end actions across all modules, not only this one.
- Consider standardizing occupancy mutations behind a shared domain service instead of duplicating logic in separate modules.

### Lower priority

- Add more explicit API docs for cursor semantics.
- Consider whether active count should support additional filters if reporting needs grow.

## Concrete Review Questions For Your Lead

1. Should occupancy lifecycle be centrally owned by one service rather than split across occupancy, users, and leases?
2. Do operations teams need a first-class "end occupancy" or "transfer occupancy" endpoint?
3. Is the current PII exposure via `includeProfile=true` acceptable for every role that can read occupancies?
4. Should occupancy history survive deletion of users, units, or buildings for audit/legal reasons?
5. Is occupancy the intended source of truth for resident presence, or should lease state become primary in more flows?

## Testing Signals

### Direct coverage already present

- `test/occupancy-constraints.spec.ts`

### Important indirect coverage

- `test/building-access.e2e.spec.ts`
  - occupancy routes participate in building-scoped access behavior
- `test/visitors.e2e.spec.ts`
  - resident visitor flows depend on active occupancy
- `test/leases-move.e2e.spec.ts`
  - move-in/move-out flows create and end occupancies outside this module
- `test/org-residents.e2e.spec.ts`
  - resident lifecycle paths interact with occupancy state
- `test/parking.e2e.spec.ts`
  - parking allocations depend on occupancy context

### Notable cases already tested

- constraint mapping for active-unit uniqueness
- constraint mapping for active-resident uniqueness
- constraint mapping for status/endAt consistency
- building-scoped occupancy permissions
- resident-safe access behavior after occupancy creation
- resident visitor creation derived from active occupancy
- resident visitor rejection when no active occupancy exists
- lease move-in conflict prevention and move-out lifecycle behavior

## Suggested Follow-On Docs

- A shared lifecycle diagram showing how `occupancies`, `users`, and `leases` all mutate the same occupancy state.
- A state-transition table for `ACTIVE -> ENDED` across resident move, lease move-out, and any future manual admin action.
