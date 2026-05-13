You are a backend agent working on TowerDesk Backend (NestJS + Prisma + Postgres).

TASK: Chunk 5 — Add permission seeding + role mappings + E2E tests for parking module.

CONTEXT
- Parking module is implemented:
  - ParkingSlot CRUD endpoints (Chunk 2)
  - ParkingAllocation endpoints (Chunk 3)
  - Vehicle endpoints (Chunk 4)
- All endpoints are guarded with JwtAuthGuard, OrgScopeGuard, PermissionsGuard and use @RequirePermissions().
- Now we must seed the permission keys and write tests.

PART A — PERMISSIONS SEED

1) Add the following permission keys to prisma/seed.ts (or wherever permission keys are defined)
Parking slots:
- parkingSlots.create
- parkingSlots.read
- parkingSlots.update

Parking allocations:
- parkingAllocations.create
- parkingAllocations.read
- parkingAllocations.end

Vehicles:
- vehicles.create
- vehicles.read
- vehicles.update
- vehicles.delete

2) Map permissions to roles:
- org_admin: grant ALL of the above
- (Optional) admin/manager: do NOT grant by default unless this repo’s patterns say otherwise. If unsure, keep only org_admin to avoid privilege expansion.

3) Ensure seed is idempotent and consistent with existing permission seeding style.

PART B — E2E TESTS

Add Jest e2e tests under test/ covering:

1) Org isolation (critical)
- Create 2 orgs.
- Create building+slots in org A.
- Ensure org B cannot:
  - list org A building slots (404 or 403 depending on existing patterns)
  - allocate org A building slots
  - end org A allocations

2) ParkingSlot flows
- Create slot
- List slots
- List available slots returns created slot

3) Allocation flows (core)
- Setup: org A, building A1, occupancy in A1, create 3 slots
- Allocate count=2:
  - returns 2 allocations
  - available slots count decreases accordingly
- Conflict:
  - attempt to allocate an already allocated slotId -> 409 and no additional allocations created
- End allocation:
  - end one allocation -> slot returns to available=true
- End-all:
  - allocate again then end-all -> all active allocations ended, available slots restored

4) Permission enforcement (minimum)
- Create a user without the required permission keys (or use an existing role in fixtures).
- Ensure calling at least 2 endpoints returns 403:
  - POST parking-slots (parkingSlots.create)
  - POST parking-allocations (parkingAllocations.create)

NOTES
- Follow existing e2e patterns in this repo (fixtures, auth helpers, request style).
- Keep tests deterministic and independent.
- Use real HTTP calls against Nest test app like existing tests.

DELIVERABLES
- Updated prisma/seed.ts with new permission keys + org_admin mapping
- New test file(s) under test/ (e.g. test/parking.e2e-spec.ts)
- Tests pass: npm test (or existing e2e command)
- No lint warnings

STOP after tests + seed are complete and green.
