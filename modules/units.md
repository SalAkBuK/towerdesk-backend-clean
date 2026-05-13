# Units Review

## Scope

- Source: `src/modules/units`
- Main files:
  - `units.controller.ts`
  - `units.service.ts`
  - `units.repo.ts`
  - `dto/create-unit.dto.ts`
  - `dto/update-unit.dto.ts`
  - `dto/list-units.query.dto.ts`
  - `dto/import-units.query.dto.ts`
  - `dto/import-units.response.dto.ts`
  - `dto/unit.response.dto.ts`
  - `dto/unit-detail.response.dto.ts`
  - `dto/unit-with-occupancy.response.dto.ts`
- Public routes:
  - `POST /org/buildings/:buildingId/units/import`
  - `POST /org/buildings/:buildingId/units`
  - `GET /org/buildings/:buildingId/units`
  - `GET /org/buildings/:buildingId/units/basic`
  - `GET /org/buildings/:buildingId/units/count`
  - `GET /org/buildings/:buildingId/units/:unitId`
  - `PATCH /org/buildings/:buildingId/units/:unitId`
- Core responsibility: manage units within a building, including detailed metadata, amenity linkage, ownership sync, vacancy views, and CSV import.

## What This Module Really Owns

- Base unit creation and update.
- The broader unit detail model, including:
  - physical fields
  - financial fields
  - furnishing/kitchen/status metadata
  - owner reference
  - amenity associations
- Vacancy and occupancy-aware read views.
- CSV import with dry-run and upsert behavior.
- Synchronization handoff to `UnitOwnershipService` when current owner changes.

## Important Architectural Note

This module looks like CRUD at first, but it actually sits at a seam between several domains:

- buildings
- owners
- unit types
- occupancies
- amenities
- unit-ownership migration logic

That makes it one of the more important operational data-entry modules in the backend.

## Step-By-Step Request Flows

### 1. Create a unit

1. Controller accepts `POST /org/buildings/:buildingId/units`.
2. `JwtAuthGuard`, `OrgScopeGuard`, and `BuildingAccessGuard` run at controller level.
3. Route requires `@BuildingWriteAccess(true)` and `units.write`.
4. Service verifies the building exists in the caller org.
5. Optional `unitTypeId` is validated inside the caller org.
6. Optional `ownerId` is validated inside the caller org.
7. Amenity handling is resolved:
   - if `amenityIds` is omitted, default active building amenities are loaded
   - if `amenityIds` is provided, those exact amenity ids are validated
8. Unit row is created in a transaction.
9. Unit-amenity links are created if needed.
10. `UnitOwnershipService.syncCurrentOwner(...)` runs in the same transaction.
11. Duplicate label errors are mapped to `409 Conflict`.

### 2. List units

1. Controller accepts `GET /org/buildings/:buildingId/units`.
2. Route requires `@BuildingReadAccess()` and `units.read`.
3. Service verifies building exists in caller org.
4. One of two paths runs:
   - standard list
   - occupancy-augmented list when `include=occupancy`
5. Standard list can also filter by `available=true`.

### 3. List basic units

1. Controller accepts `GET /org/buildings/:buildingId/units/basic`.
2. Route uses `@BuildingReadAccess(true)`, meaning resident-safe access is allowed here.
3. Service loads units through the standard list path.
4. Response returns only:
   - `id`
   - `label`

### 4. Count total and vacant units

1. Controller accepts `GET /org/buildings/:buildingId/units/count`.
2. Route requires building read plus `units.read`.
3. Service verifies building exists.
4. Repo counts:
   - all units in building
   - units with no active occupancy
5. Response returns `{ total, vacant }`.

### 5. Get unit detail

1. Controller accepts `GET /org/buildings/:buildingId/units/:unitId`.
2. Route requires building read plus `units.read`.
3. Service verifies building exists.
4. Repo loads unit scoped to building with amenity joins.
5. Response returns the richer detail payload including amenity IDs and amenity names.

### 6. Update a unit

1. Controller accepts `PATCH /org/buildings/:buildingId/units/:unitId`.
2. Route requires building write plus `units.write`.
3. Service verifies building exists.
4. Service verifies the unit belongs to that building.
5. Optional `unitTypeId`, `ownerId`, and `amenityIds` are validated.
6. Unit update is executed in a transaction.
7. If `amenityIds` is present:
   - existing links are deleted
   - replacement links are created
8. If `ownerId` is present:
   - `UnitOwnershipService.syncCurrentOwner(...)` is called
9. Final detail row is reloaded and returned.
10. Duplicate label errors are mapped to `409 Conflict`.

### 7. Import units from CSV

1. Controller accepts `POST /org/buildings/:buildingId/units/import`.
2. Route requires building write plus `units.write`.
3. File upload is required.
4. Service verifies building exists in caller org.
5. Query options are read:
   - `dryRun`
   - `mode = create | upsert`
6. CSV is parsed.
7. Headers are canonicalized and validated.
8. Rows are validated and normalized into `CreateUnitDto`-like data.
9. Unit types are resolved by name within the org.
10. Duplicate labels inside CSV are rejected.
11. Existing building units are loaded to detect conflicts.
12. In `create` mode:
   - existing labels cause errors
13. In `upsert` mode:
   - existing labels are updated
   - missing labels are created
14. If `dryRun=true` or any validation errors exist:
   - summary is returned
   - nothing is written
15. If writing proceeds:
   - default building amenities are applied to newly created rows
   - updates do not replace amenities during CSV upsert
16. Response returns summary, errors, and unit IDs when writes occur.

## Read Models And Response Shapes

### Standard list response

Returns a minimal row:

- `id`
- `buildingId`
- `label`
- `floor`
- `notes`
- `createdAt`
- `updatedAt`

### Basic response

Returns only:

- `id`
- `label`

### Detail response

Adds the richer unit model, including:

- `unitTypeId`
- `ownerId`
- `maintenancePayer`
- physical attributes
- financial attributes
- meter numbers
- `amenityIds`
- amenity name list

Important detail:

- decimal fields are serialized as strings in detail responses.

### Occupancy-augmented list response

For `include=occupancy`, list rows include:

- building name
- unit type name
- unit status
- active occupancy if present
- resident summary
- current lease summary if attached

## Validation And Defaults

### Create / update DTO patterns

- `label` required on create, optional on update
- optional `floor`, `bedrooms`, `bathrooms` must be integers
- many numeric fields must be `>= 0`
- enum fields are validated against Prisma enums
- `amenityIds` must be unique UUIDs
- update supports `status`, which create does not expose directly

### Import defaults and constraints

- max 2000 rows per CSV
- required header: `label`
- headers are accepted in canonicalized form
- unit type is resolved by name
- booleans support common textual forms like `true/false`, `yes/no`, `1/0`
- errors are row-based and field-aware

### Amenity default semantics

- create:
  - omitted `amenityIds` => use active default amenities
  - `amenityIds: []` => attach none
- update:
  - omitted `amenityIds` => do not change current amenity links
  - provided `amenityIds` => replace current amenity links entirely
- import:
  - created rows get default amenities
  - upsert updates do not explicitly reapply or replace amenities

## Data And State Model

### Core tables touched directly

- `Unit`
- `BuildingAmenity`
- `UnitAmenity`
- `UnitType`
- `Owner`

### External/domain side effects

- `UnitOwnershipService.syncCurrentOwner(...)` keeps current-owner state aligned with owner changes.
- Vacancy calculations depend on `Occupancy`.
- Rich occupancy list responses depend on active occupancy plus lease joins.

## Edge Cases And Important Scenarios

### Building and org-scope edge cases

- Every unit flow first verifies building ownership inside the caller org.
- Cross-org building access should look like not found.

### Label uniqueness edge cases

- Unit labels are unique within a building.
- Duplicate create or update label collisions become `409 Conflict`.
- CSV create mode rejects labels already present in DB.
- CSV also rejects duplicates inside the same file.

### Owner and ownership edge cases

- `ownerId` must belong to the same org.
- Updating `ownerId` also triggers ownership synchronization logic.
- The module still operates during an ownership-model transition, so owner changes are more important than a plain foreign-key update.

### Amenity edge cases

- Amenity IDs must belong to the same building and be active.
- Default amenities apply only when omitted on create/import-created rows.
- Invalid amenity IDs fail the request rather than being silently ignored.

### Occupancy / availability edge cases

- Vacancy is defined by "no active occupancy", not by unit status alone.
- `include=occupancy` and `available=true` are conceptually different reads.
- Resident-safe `basic` route is intentionally narrower than full unit detail.

### CSV import edge cases

- Unknown or duplicate headers fail validation.
- Empty CSV returns an error-style response rather than silently succeeding.
- Too many rows are rejected before deeper processing.
- Dry-run returns summary without writing.
- In upsert mode, updates do not fully mirror create semantics, especially around amenities and ownership sync.

## Strengths

- Strong validation around related entities and building ownership.
- Clear separation between standard list, basic list, detail, and occupancy-rich views.
- CSV import is relatively robust for an in-module implementation.
- Default amenity semantics are deliberate and useful.
- Owner changes are routed through ownership sync rather than treated as a trivial FK update.

## Risks And Design Weaknesses

### 1. Import logic is large and domain-heavy

- `importCsv(...)` is doing parsing, validation, normalization, conflict detection, and persistence orchestration in one method.
- It is functional, but it is a natural maintenance hotspot.

### 2. Import and manual create/update are not perfectly symmetrical

- CSV upsert updates fields, but it does not explicitly run the same amenity and ownership-sync behavior as manual update.
- That may be intentional, but it should be documented because it can surprise admins.

### 3. Unit is carrying mixed concerns

- Inventory identity
- physical metadata
- financial terms
- amenity links
- current owner pointer
- occupancy-aware visibility

This is probably necessary, but it makes the module dense.

### 4. Response-shape differences are easy to misuse

- Minimal list returns very little.
- Detail returns decimals as strings.
- Occupancy list returns nested occupant and lease info.
- Frontend consumers need to be explicit about which endpoint they actually need.

## Improvement Opportunities

### High priority

- Split CSV import parsing/validation/persistence into clearer internal helpers.
- Document import-vs-manual-update behavioral differences, especially for amenities and ownership sync.
- Add stronger tests or docs around owner synchronization when units are created or updated.

### Medium priority

- Add pagination and richer filtering if building inventories become large.
- Consider async/background import jobs if CSV volumes grow.
- Add import result artifacts or downloadable error reports for admin users.

### Lower priority

- Add more explicit reporting around vacancy vs status if business users need both.
- Add audit history for significant financial/ownership field changes.

## Concrete Review Questions For Your Lead

1. Should CSV upsert mirror full manual update semantics, including owner sync and amenity replacement?
2. Is in-request CSV import still acceptable, or is it time to move it to async jobs?
3. Do you need pagination/filtering now for large buildings?
4. Should unit financial fields and inventory fields stay in one module/endpoint shape, or be split more clearly over time?
5. Do you want stronger auditability for owner changes and rent/security-deposit changes?

## Testing Signals

### Integration coverage already present

- `test/org-units.e2e.spec.ts`

### Notable cases already tested

- basic create and list
- extended-field create and detail read
- owner change during ownership transition
- CSV dry-run and create
- CSV duplicate handling without writes
- basic list shape
- org-local owner search dependency behavior
- org-scope enforcement and cross-org rejection
- duplicate label conflict
- invalid payload rejection

## Suggested Follow-On Docs

- A unit-import behavior note describing `create` vs `upsert`.
- A response-shape comparison table for list, basic, detail, and occupancy-inclusive reads.
