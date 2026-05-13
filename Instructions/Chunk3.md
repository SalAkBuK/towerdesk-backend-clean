You are a backend Codex agent working on TowerDesk Backend (NestJS + Prisma + Postgres).

TASK: Chunk 3 — Parking Allocations (core feature) ONLY.
Assume Chunk 1 (Prisma) + Chunk 2 (ParkingSlot APIs) are already merged.

GOAL
Implement dynamic allocation of parking slots from a building’s shared pool to an Occupancy (tenant).
An occupancy can have MULTIPLE allocated slots.
We do NOT map specific vehicles to slots (no “vehicle->slot enforcement”).
Allocation must be atomic: allocate-all-or-nothing.
A slot can only have ONE active allocation at a time (endDate NULL = active).

PERMISSIONS (use these exact keys)
- parkingAllocations.create
- parkingAllocations.end
- parkingAllocations.read
(Keep existing parkingSlots.* from Chunk 2 unchanged.)

MODULE LOCATION
Use existing src/modules/parking/* created in Chunk 2.
Add allocation DTOs, service methods, repo methods, and controller routes in the same module.

ENDPOINTS

1) Allocate slots (manual or automatic selection)
POST /buildings/:buildingId/parking-allocations
Guards: JwtAuthGuard + OrgScopeGuard + PermissionsGuard
Perm: parkingAllocations.create
Body DTO (one of these modes must be valid):
Mode A (manual):
{
  occupancyId: string,
  slotIds: string[]   // length >= 1
}
Mode B (auto-pick):
{
  occupancyId: string,
  count: number       // integer >= 1
}
Rules:
- Validate building belongs to org (orgId from @CurrentUser).
- Validate occupancyId belongs to same org.
- For manual:
  - Validate all slotIds belong to (orgId, buildingId) AND slots are active (isActive=true)
  - Validate NONE of the slots already has an active allocation (endDate IS NULL)
- For auto-pick:
  - Select `count` available slots in that building (isActive=true AND no active allocation)
  - Deterministic ordering: by code asc (or createdAt asc). Pick one and be consistent.
  - If not enough available slots -> 409 with clear message.

ATOMICITY + CONCURRENCY
- Wrap allocation in prisma.$transaction.
- Inside the transaction:
  - Re-check availability for requested slots (or selected slots) to prevent race conditions.
  - If any conflict occurs, throw and ensure NO allocations are created.
- If conflict: return 409 (Conflict).

Create allocations:
- Create ParkingAllocation rows for each slot:
  - orgId, buildingId, parkingSlotId, occupancyId
  - startDate = now()
  - endDate = null

Return response:
- The created allocations with slot summary (slot id + code), plus occupancyId, startDate.
- Keep response minimal and consistent.

2) End a single allocation
POST /parking-allocations/:allocationId/end
Perm: parkingAllocations.end
Body DTO:
{ endDate?: string }  // ISO date optional; default now
Rules:
- Find allocation by id + orgId (404 if not found).
- If already ended (endDate not null) -> 400 or 409 (choose one; be consistent).
- Set endDate.

3) End all allocations for an occupancy (very useful on move-out)
POST /occupancies/:occupancyId/parking-allocations/end-all
Perm: parkingAllocations.end
Rules:
- Validate occupancy in org.
- Set endDate=now() on all active allocations for that occupancy in org.
- Return count ended.

4) List allocations for an occupancy
GET /occupancies/:occupancyId/parking-allocations?active=true|false
Perm: parkingAllocations.read
Rules:
- Validate occupancy in org.
- If active=true: endDate IS NULL
- If active is omitted: return all allocations
- Include slot summary in response (slot id + code + level + type)

IMPLEMENTATION NOTES
- Repo methods should accept DbClient (PrismaService | TransactionClient) like existing patterns.
- Available slots query should mirror Chunk 2:
  where { orgId, buildingId, isActive: true, allocations: { none: { endDate: null } } }
- For manual allocation availability check:
  - Fetch slots by ids with orgId/buildingId/isActive
  - Ensure fetched count equals requested count
  - Check active allocations for those slots (endDate null); if any found -> conflict
- Use class-validator DTOs with clear validation errors.
- Use consistent HTTP exceptions:
  - 404 not found (org-scoped)
  - 403 missing permission
  - 409 conflict (slot already allocated OR not enough slots)
  - 400 bad request (invalid payload / allocation already ended, etc.)

DELIVERABLES
- Controller routes + DTOs + service/repo implementation
- Must compile and pass lint.
- Optional tests are fine to skip in this chunk (they’ll be required in Chunk 5), but code should be testable.

DO NOT
- Implement Vehicle endpoints (Chunk 4)
- Add seed/permission mapping changes (Chunk 5)
- Add any “vehicle to slot” mapping

Stop after allocation endpoints work.
