You are Claude, acting as a backend engineer on the TowerDesk Backend
(NestJS + Prisma + Postgres + Prisma ORM).

CONTEXT
- Chunk 1 (Prisma schema) is complete and merged.
- Chunk 2 (ParkingSlot CRUD) is complete.
- Chunk 3 (Parking Allocations) is complete and correct.
- This chunk is Vehicles ONLY.

GOAL
Add support for storing vehicle numbers for a tenant (Occupancy).
Vehicles are informational ONLY.
Do NOT associate vehicles with parking slots.
Do NOT enforce which vehicle parks in which slot.

SCOPE RULES (IMPORTANT)
- Vehicles belong to an Occupancy.
- Vehicles belong to an Org (org-scoped).
- Vehicles are NOT used in parking allocation logic.
- Keep this module simple CRUD.

MODULE
Use existing parking module:
src/modules/parking/

Add:
- vehicle DTOs
- controller routes
- service methods
- repo methods

DO NOT:
- Touch ParkingSlot logic
- Touch ParkingAllocation logic
- Add slot↔vehicle relations
- Add seed or permission mapping yet (Chunk 5 will do that)

PRISMA MODEL (ALREADY EXISTS)
Vehicle:
- id
- orgId
- occupancyId
- plateNumber
- label?
- createdAt

ENDPOINTS

1) Create vehicle
POST /org/occupancies/:occupancyId/vehicles
Permissions: vehicles.create
Body:
{
  plateNumber: string,
  label?: string
}

Rules:
- Validate occupancy exists and belongs to org.
- Enforce unique plateNumber per org (Prisma constraint).
- Return created vehicle.

2) List vehicles for occupancy
GET /org/occupancies/:occupancyId/vehicles
Permissions: vehicles.read

Rules:
- Validate occupancy belongs to org.
- Return all vehicles for occupancy ordered by createdAt asc.

3) Update vehicle (optional but preferred)
PATCH /org/vehicles/:vehicleId
Permissions: vehicles.update
Body:
{
  plateNumber?: string,
  label?: string | null
}

Rules:
- Fetch vehicle by id + orgId.
- Enforce plateNumber uniqueness per org if changed.

4) Delete vehicle (soft delete NOT required)
DELETE /org/vehicles/:vehicleId
Permissions: vehicles.delete

Rules:
- Fetch vehicle by id + orgId.
- Hard delete is acceptable.

VALIDATION & ERRORS
- Use class-validator DTOs.
- Use standard NestJS exceptions:
  - 404 if occupancy or vehicle not found (org-scoped)
  - 409 if plateNumber violates uniqueness
  - 403 handled by PermissionsGuard

IMPLEMENTATION NOTES
- Follow existing controller/service/repo patterns from parking module.
- Repo methods should scope by orgId.
- Controllers must use:
  @UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
- Gate endpoints with @RequirePermissions(...) decorator.

RESPONSE SHAPE
Vehicle DTO response:
{
  id,
  occupancyId,
  plateNumber,
  label,
  createdAt
}

DELIVERABLES
- DTOs
- Controller routes
- Service + repo implementation
- Code must compile and pass lint

STOP after vehicle endpoints are complete.
Do NOT implement permissions seed or tests yet.
