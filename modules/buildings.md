# Buildings Review

## Scope

- Source: `src/modules/buildings`
- Main files:
  - `buildings.controller.ts`
  - `buildings.service.ts`
  - `buildings.repo.ts`
  - `dto/create-building.dto.ts`
  - `dto/building.response.dto.ts`
- Public routes:
  - `POST /org/buildings`
  - `GET /org/buildings`
  - `GET /org/buildings/assigned`
  - `GET /org/buildings/:buildingId`
  - `DELETE /org/buildings/:buildingId`
- Core responsibility: create, list, expose, and delete org-scoped building records.

## What This Module Really Owns

- The base building record for an org.
- Defaulting and validation for core building metadata:
  - `name`
  - `city`
  - `emirate`
  - `country`
  - `timezone`
  - `floors`
  - `unitsCount`
- The distinction between:
  - full org building list
  - assignment-derived "my buildings" list
- The first layer of building existence checks before downstream building-scoped modules act.

## Important Architectural Note

This module is small, but the entity it owns is foundational.

`Building` is the scoping anchor for:

- units
- residents
- occupancies
- leases
- parking
- visitors
- maintenance requests
- messaging in some contexts
- building-scoped access assignments

So while the module itself looks simple, its data is not low-impact.

## Step-By-Step Request Flows

### 1. Create building

1. Controller accepts `POST /org/buildings`.
2. `JwtAuthGuard` and `OrgScopeGuard` run at controller level.
3. `PermissionsGuard` runs on the route.
4. Caller must have `buildings.write`.
5. Service derives `orgId` only from authenticated org scope.
6. Input is normalized:
   - `name.trim()`
   - `city.trim()`
   - `emirate?.trim()`
   - `country?.trim() ?? 'ARE'`
   - `timezone?.trim() ?? 'Asia/Dubai'`
7. Repo creates the row.
8. Response returns normalized building data.

### 2. List all buildings in org

1. Controller accepts `GET /org/buildings`.
2. `JwtAuthGuard`, `OrgScopeGuard`, and route-level `PermissionsGuard` run.
3. Caller must have `buildings.read`.
4. Service derives org scope from authenticated user.
5. Repo lists all buildings for that org.
6. Results are returned in descending `createdAt` order.

### 3. List assigned buildings

1. Controller accepts `GET /org/buildings/assigned`.
2. Controller still requires authenticated org context, but no explicit `RequirePermissions(...)` is attached here.
3. Service derives org scope and current user id.
4. Repo lists buildings where the user has a building-scoped access assignment.
5. Results are returned in descending `createdAt` order.

### 4. Get one building by id

1. Controller accepts `GET /org/buildings/:buildingId`.
2. `BuildingAccessGuard` runs on the route.
3. `@BuildingReadAccess()` marks this as a building-read operation.
4. `@RequirePermissions('buildings.read')` is also attached.
5. Guard delegates to building-access rules, which can combine:
   - effective permissions
   - scoped building access
   - optional resident-read allowances for other endpoints
6. Service still verifies the building exists in the current org.
7. Missing or cross-org building returns not found behavior.

### 5. Delete building

1. Controller accepts `DELETE /org/buildings/:buildingId`.
2. `PermissionsGuard` runs on the route.
3. Caller must have `buildings.delete`.
4. Service derives org scope from current user.
5. Repo issues `deleteMany` scoped by both `orgId` and `buildingId`.
6. If nothing was deleted, service throws `NotFoundException`.
7. Otherwise response is `204 No Content`.

## Validation And Defaults

### Create DTO rules

- `name`
  - string
  - minimum length 2
- `city`
  - string
  - minimum length 2
- `emirate`
  - optional string
- `country`
  - optional
  - must match three uppercase letters
- `timezone`
  - optional string
- `floors`
  - optional integer
  - minimum 1
- `unitsCount`
  - optional integer
  - minimum 1

### Default values applied in service

- `country = 'ARE'`
- `timezone = 'Asia/Dubai'`
- nullable numeric fields become `null` rather than remaining undefined in persistence

## Data Model

### Building fields exposed in response

- `id`
- `orgId`
- `name`
- `city`
- `emirate`
- `country`
- `timezone`
- `floors`
- `unitsCount`
- `createdAt`
- `updatedAt`

### Query patterns used here

- org-local list by `orgId`
- assignment-derived list via `accessAssignments.some(...)`
- org-local lookup by `orgId + buildingId`
- org-local delete by `orgId + buildingId`

## Access Model

### `GET /org/buildings`

- Explicit permission-gated by `buildings.read`.
- Intended as the full org-admin/org-reader list surface.

### `GET /org/buildings/assigned`

- Personal-scope list.
- Returns buildings tied to the current user’s building-scoped access assignments.
- Important: this is based on RBAC v2 access assignments, not legacy `BuildingAssignment` rows.

### `GET /org/buildings/:buildingId`

- Protected by `BuildingAccessGuard`.
- This means read access can depend on more than just org-wide `buildings.read`, depending on effective scoped access resolved by the guard path.

### `DELETE /org/buildings/:buildingId`

- Simple permission check plus org-local existence scope.
- Does not itself inspect downstream dependencies before delete.

## Edge Cases And Important Scenarios

### Org-scoping edge cases

- Client-supplied `orgId` must not control the created record.
- Missing org context blocks all `/org/*` building routes.
- Cross-org reads and deletes should not leak existence.

### Validation edge cases

- `country` format is constrained to a 3-letter uppercase code.
- `floors=0` and `unitsCount=0` are rejected.
- Missing `city` or too-short `name/city` are rejected by validation.

### Assigned-buildings edge cases

- `listAssigned` depends on access-assignment data being present and current.
- If a user has no building-scoped assignments, result should simply be empty.
- Because this is now tied to RBAC v2 access assignments, teams must not assume it is powered by legacy building-assignment tables.

### Delete edge cases

- The module only checks org-local existence before delete.
- If Prisma/database relations cascade, deletion can remove far more than the route surface suggests.
- If relations restrict delete, failures will bubble from below this module.

## Strengths

- Very clear service and repo responsibilities.
- Good use of authenticated org scope instead of trusting request payload.
- `listAssigned` reflects the newer access-assignment model rather than stale legacy assumptions.
- Delete uses org-scoped delete semantics, which prevents accidental cross-org deletion.

## Risks And Design Weaknesses

### 1. Delete is deceptively simple

- The module exposes a one-line delete path.
- In practice, a building is a root entity for many other domains.
- Without pre-delete impact visibility, this can be operationally risky.

### 2. No update route

- There is create, list, read, and delete, but no edit path.
- That usually leads to awkward operational workarounds when building metadata changes.

### 3. `assigned` route semantics may be misunderstood

- Older mental models may expect legacy building-assignment sourcing.
- The current implementation is based on scoped access assignments.

### 4. Module-level simplicity can hide architectural importance

- Because the code is short, it is easy to under-document or under-test downstream assumptions tied to building identity.

## Improvement Opportunities

### High priority

- Add an update endpoint for ordinary building metadata corrections.
- Add a pre-delete impact check or at least document exact delete semantics.
- Make the `assigned` route contract explicit in docs and frontend expectations.

### Medium priority

- Add pagination or lightweight filters if orgs can have many buildings.
- Consider a soft-delete/archive model if operational recovery matters.
- Add audit logging for create, update, and delete actions.

### Lower priority

- Add richer building metadata only if product actually needs it.
- Add building status/configuration split if operational settings start mixing with profile data.

## Concrete Review Questions For Your Lead

1. Should buildings be hard-deleted, soft-deleted, or blocked from deletion once dependent data exists?
2. Do you need an update endpoint immediately for operational correctness?
3. Should `GET /org/buildings/assigned` remain user-personal and assignment-derived, or should it expose richer scope metadata?
4. Do you want a deletion guardrail that shows how many units/residents/leases/requests would be affected?

## Testing Signals

### Integration coverage already present

- `test/org-buildings.e2e.spec.ts`

### Notable cases already tested

- org A vs org B isolation for list/read behavior
- rejection of `/org/*` requests without org context
- rejection of client-supplied `orgId` in body
- default `country` and `timezone`
- full payload create
- org-scoped delete behavior
- delete-not-found handling
- DTO validation failures for missing `city`, bad `floors`, and bad `unitsCount`

## Suggested Follow-On Docs

- A short dependency map showing which modules hang off `Building`.
- A deletion policy note clarifying whether building delete is intended for production use or mostly for admin cleanup.
