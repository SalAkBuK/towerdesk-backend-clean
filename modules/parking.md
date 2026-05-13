# Parking Review

## Scope

- Source: `src/modules/parking`
- Main files:
  - `parking.controller.ts`
  - `resident-parking.controller.ts`
  - `parking.service.ts`
  - `parking.repo.ts`
  - `dto/*`
- Public routes:
  - `POST /org/buildings/:buildingId/parking-slots/import`
  - `POST /org/buildings/:buildingId/parking-slots`
  - `GET /org/buildings/:buildingId/parking-slots`
  - `PATCH /org/parking-slots/:slotId`
  - `POST /org/buildings/:buildingId/parking-allocations`
  - `POST /org/parking-allocations/:allocationId/end`
  - `POST /org/occupancies/:occupancyId/parking-allocations/end-all`
  - `POST /org/units/:unitId/parking-allocations/end-all`
  - `GET /org/occupancies/:occupancyId/parking-allocations`
  - `GET /org/units/:unitId/parking-allocations`
  - `POST /org/occupancies/:occupancyId/vehicles`
  - `GET /org/occupancies/:occupancyId/vehicles`
  - `PATCH /org/vehicles/:vehicleId`
  - `DELETE /org/vehicles/:vehicleId`
  - `GET /resident/parking/active-allocation`
- Core responsibility: manage parking inventory and assign it to occupancies or units, with basic vehicle registration tied to occupancies.

## What This Module Really Owns

- Parking slot inventory per building.
- Parking allocations:
  - to an active occupancy (lease-backed)
  - or to a unit without an occupancy
- Parking allocation lifecycle (start/end).
- Vehicle registry tied to occupancy.
- CSV import for slot inventory (create or upsert).
- Lease activity logging for allocation/vehicle events.

## Step-By-Step Request Flows

### 1. Create a parking slot

1. Controller accepts `POST /org/buildings/:buildingId/parking-slots`.
2. Guards: `JwtAuthGuard`, `OrgScopeGuard`, `PermissionsGuard`.
3. Requires `parkingSlots.create`.
4. Service asserts building exists in caller org.
5. Repo creates slot; defaults:
   - `isCovered` -> `false`
   - `isActive` -> `true`
6. Unique `(buildingId, code)` violations map to `409 Conflict`.

### 2. List parking slots

1. Controller accepts `GET /org/buildings/:buildingId/parking-slots`.
2. Requires `parkingSlots.read`.
3. Service asserts building exists in caller org.
4. Repo returns all slots, or `available=true` filters to slots without active allocations.

### 3. Update a parking slot

1. Controller accepts `PATCH /org/parking-slots/:slotId`.
2. Requires `parkingSlots.update`.
3. Service asserts slot exists in caller org.
4. Repo updates allowed fields.
5. Unique `(buildingId, code)` violation maps to `409 Conflict`.

### 4. Import slots from CSV

1. Controller accepts `POST /org/buildings/:buildingId/parking-slots/import`.
2. Requires `parkingSlots.create`.
3. CSV file is required and capped at 5 MB.
4. Service verifies building exists in caller org.
5. Query options read:
   - `dryRun` (default false)
   - `mode = create | upsert` (default create)
6. CSV is parsed and headers canonicalized.
7. Supported headers:
   - `code` (required)
   - `type` (required)
   - `level` (optional)
   - `isCovered` (optional, boolean)
   - `isActive` (optional, boolean)
8. Per-row validation:
   - blank rows are skipped
   - duplicate codes inside CSV are rejected
   - type must match `ParkingSlotType` enum
   - boolean fields accept `true/false`, `1/0`, `yes/no`
9. Max rows: 5000.
10. DB conflict detection:
    - create mode rejects codes that already exist in the building
    - upsert mode updates existing rows and creates the rest
11. If `dryRun=true` or errors exist:
    - return summary + errors
    - no writes performed
12. Writes happen in a transaction:
    - upsert updates existing rows
    - create inserts new rows
13. Response includes summary + created/updated IDs when written.

### 5. Allocate parking slots

1. Controller accepts `POST /org/buildings/:buildingId/parking-allocations`.
2. Requires `parkingAllocations.create`.
3. Service asserts building exists in caller org.
4. Exactly one target is required:
   - `occupancyId` (lease-backed)
   - `unitId` (no occupancy required)
5. Occupancy target flow:
   - occupancy must exist in org
   - occupancy must be `ACTIVE`
   - an active lease for the occupancy must exist
   - occupancy must belong to the same building
6. Unit target flow:
   - unit must exist in building
7. Exactly one selection mode is required:
   - explicit `slotIds`
   - `count` auto-selection
8. Slot validation:
   - `slotIds` must exist, be active, and belong to building
   - any active allocation on a slot -> `409 Conflict`
9. Auto-selection (`count`):
   - pulls available active slots ordered by `code` then `createdAt`
   - insufficient slots -> `409 Conflict`
10. Allocations are created in a transaction.
11. Occupancy allocations write lease activity:
    - `PARKING_ALLOCATED` with slot IDs, codes, and count.

### 6. End a single allocation

1. Controller accepts `POST /org/parking-allocations/:allocationId/end`.
2. Requires `parkingAllocations.end`.
3. Service asserts allocation exists and is not already ended.
4. End date defaults to now, or uses `endDate` from request.
5. Allocation is ended in a transaction.
6. For occupancy allocations, lease activity is written:
   - `PARKING_ALLOCATION_ENDED` with slot details and end date.

### 7. End all allocations for an occupancy

1. Controller accepts `POST /org/occupancies/:occupancyId/parking-allocations/end-all`.
2. Requires `parkingAllocations.end`.
3. Service asserts occupancy exists, active, and has an active lease.
4. All active allocations end in a transaction.
5. If anything ended, a single lease activity is written:
   - `PARKING_ALLOCATION_ENDED` with `scope=ALL_ACTIVE_ALLOCATIONS`.

### 8. End all allocations for a unit

1. Controller accepts `POST /org/units/:unitId/parking-allocations/end-all`.
2. Requires `parkingAllocations.end`.
3. Service asserts unit exists in org.
4. All active allocations for the unit are ended (no lease activity).

### 9. List allocations for an occupancy

1. Controller accepts `GET /org/occupancies/:occupancyId/parking-allocations`.
2. Requires `parkingAllocations.read`.
3. Service asserts occupancy exists in org.
4. Repo returns allocations, optionally `active=true` to filter `endDate=null`.

### 10. List allocations for a unit

1. Controller accepts `GET /org/units/:unitId/parking-allocations`.
2. Requires `parkingAllocations.read`.
3. Service asserts unit exists in org.
4. Repo returns allocations, optionally `active=true`.

### 11. Create a vehicle

1. Controller accepts `POST /org/occupancies/:occupancyId/vehicles`.
2. Requires `vehicles.create`.
3. Service asserts occupancy is active and has an active lease.
4. Vehicle is created in a transaction.
5. Unique plate constraint violations map to `409 Conflict`.
6. Lease activity is written:
   - `VEHICLE_ADDED` with plate and label.

### 12. List vehicles for an occupancy

1. Controller accepts `GET /org/occupancies/:occupancyId/vehicles`.
2. Requires `vehicles.read`.
3. Service asserts occupancy exists in org.
4. Repo returns vehicles ordered by `createdAt`.

### 13. Update a vehicle

1. Controller accepts `PATCH /org/vehicles/:vehicleId`.
2. Requires `vehicles.update`.
3. Service asserts vehicle exists in org.
4. Service asserts occupancy is active with an active lease.
5. Update happens in a transaction.
6. Unique plate constraint violations map to `409 Conflict`.
7. Lease activity is written with previous/current values:
   - `VEHICLE_UPDATED`.

### 14. Delete a vehicle

1. Controller accepts `DELETE /org/vehicles/:vehicleId`.
2. Requires `vehicles.delete`.
3. Service asserts vehicle exists in org.
4. Service asserts occupancy is active with an active lease.
5. Deletion happens in a transaction.
6. Lease activity is written:
   - `VEHICLE_DELETED`.

### 15. Resident active allocation

1. Controller accepts `GET /resident/parking/active-allocation`.
2. Guards: `JwtAuthGuard`, `OrgScopeGuard`.
3. Service finds the most recent active occupancy for the resident in org.
4. Active allocations for that occupancy are loaded.
5. The first allocation is returned, or `null` if none exist.

## Read Models And Response Shapes

### Parking slot response

- `id`
- `orgId`
- `buildingId`
- `code`
- `level`
- `type`
- `isCovered`
- `isActive`
- `createdAt`

### Parking allocation response

- `id`
- `occupancyId` or `unitId`
- `parkingSlotId`
- `buildingId`
- `orgId`
- `startDate`
- `endDate`
- `slot` summary:
  - `id`
  - `code`
  - `level`
  - `type`

### Vehicle response

- `id`
- `occupancyId`
- `plateNumber`
- `label`
- `createdAt`

### CSV import response

- `dryRun`
- `mode`
- `summary`
  - `totalRows`
  - `validRows`
  - `created`
  - `updated`
- `errors[]` with row, field, message
- `slotIds` (only when writes occur)

## Validation And Defaults

### Parking slot rules

- `code` required, 1-50 chars.
- `type` required, enum `ParkingSlotType`.
- `level` optional, max 50 chars, nullable.
- `isCovered` and `isActive` optional booleans.
- Unique code per building enforced at DB; conflicts -> `409`.

### Allocation rules

- Exactly one of `occupancyId` or `unitId` required.
- Exactly one of `slotIds` or `count` required.
- `slotIds` must be non-empty, and all slots must be active in building.
- `count` must be `>= 1`.
- Occupancy allocations require:
  - occupancy status `ACTIVE`
  - an active lease
  - occupancy belongs to building.

### Allocation end rules

- `endDate` optional ISO string; defaults to now.
- Allocation cannot be ended twice.

### Vehicle rules

- `plateNumber` required on create.
- `label` optional; can be set to `null` on update.
- Unique plate enforced at DB; conflicts -> `409`.
- Occupancy must be active and leased for create/update/delete.

### CSV import rules

- Max rows: 5000.
- Required headers: `code`, `type`.
- Duplicate headers rejected.
- Unknown headers rejected.
- Duplicate codes inside CSV rejected.
- Boolean parsing accepts `true/false`, `1/0`, `yes/no`.
- `create` mode rejects existing codes.
- `upsert` updates existing, creates missing.
- `dryRun` returns summary without writes.

## Data And State Model

### Core tables touched directly

- `ParkingSlot`
- `ParkingAllocation`
- `Vehicle`
- `LeaseActivity`

### Allocation target model

- `ParkingAllocation` stores either:
  - `occupancyId` (lease-backed)
  - or `unitId` (unit-only allocation)
- Allocations are active when `endDate` is `null`.

### Lease activity side effects

- `PARKING_ALLOCATED`
- `PARKING_ALLOCATION_ENDED`
- `VEHICLE_ADDED`
- `VEHICLE_UPDATED`
- `VEHICLE_DELETED`

## Edge Cases And Important Scenarios

### Allocation target ambiguity

- The API allows allocation to either occupancy or unit.
- Both provided or neither provided returns `400`.

### Occupancy/lease dependency

- Occupancy allocations require an active lease.
- Ending allocations for occupancy also depends on an active lease to write activity.
- Unit allocations do not require lease validation and never write lease activity.

### Slot availability edge cases

- `available=true` filter excludes any slot with an active allocation.
- Auto-allocation (`count`) depends on current allocation state and active slots only.
- Allocating with explicit `slotIds` will fail if any slot is already allocated.

### CSV import edge cases

- Empty CSV returns an error payload, not a no-op success.
- Duplicate header names are rejected.
- Duplicate codes within CSV are rejected even before DB checks.
- In create mode, any existing code blocks the write and returns errors.

### Vehicle edge cases

- Plate uniqueness is enforced globally; this can collide across buildings in the same org.
- Vehicles are always tied to occupancy, not to unit.
- Updates require an active lease even if only changing label.

### Resident active allocation

- Only the most recent active occupancy is considered.
- If multiple allocations are active, only the first is returned.

## Strengths

- Clear separation between slot inventory, allocation, and vehicles.
- Allocation paths guard against over-allocation and cross-org leaks.
- CSV import has robust validation and dry-run support.
- Lease activity logging provides audit context for occupancy allocations and vehicles.

## Risks And Design Weaknesses

### 1. Occupancy vs unit allocation split increases complexity

- Two lifecycle models with different side effects can lead to inconsistent reporting.
- Unit allocations do not emit lease activity, so auditing is asymmetric.

### 2. Resident active allocation returns a single allocation

- If multiple active allocations exist for one occupancy, the resident endpoint returns only the first item.
- Client-side consumers may assume there is only one allocation.

### 3. CSV import does not surface partial-success states

- Errors stop the write in create mode and return summary only.
- There is no partial-success or per-row output for corrected rows.

### 4. Vehicle uniqueness scope is unclear

- DB uniqueness appears to be global for plate numbers.
- If multi-country operations exist, normalization or per-org scoping may be needed.

## Improvement Opportunities

### High priority

- Document the intended semantics of occupancy vs unit allocations and when each should be used.
- Decide whether resident endpoint should return all active allocations.
- Explicitly state vehicle plate uniqueness scope in API docs.

### Medium priority

- Add utilization/reporting endpoints for buildings or orgs.
- Add optional pagination for slot and allocation lists if inventories grow.
- Provide import error export or better CSV feedback for large batches.

### Lower priority

- Add soft-delete/archive for slots and vehicles rather than hard delete.
- Add richer audit trail or event stream for allocations beyond lease activity.

## Concrete Review Questions For Your Lead

1. Do we want allocation to support both unit and occupancy, or should one be deprecated?
2. Should resident `active-allocation` return a list rather than a single allocation?
3. Is plate uniqueness intended to be org-wide or building-wide, and do we need normalization?
4. Should parking allocations be auto-ended when an occupancy or lease ends?
5. Is the current CSV import UX sufficient for larger inventories?

## Testing Signals

### Integration coverage already present

- `test/parking.e2e.spec.ts`

### Notable cases already tested

- org isolation across slot list and allocation
- list available slots filtering by active allocations
- allocate by count and by explicit slot IDs
- conflict when slot already allocated
- end one allocation and end-all flows
- CSV dry-run + create
- CSV duplicate handling without writes
- permission enforcement
