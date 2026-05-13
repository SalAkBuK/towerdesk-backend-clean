You are a backend Codex agent working on TowerDesk Backend (NestJS + Prisma + Postgres).

TASK: Chunk 2 — ParkingSlot CRUD APIs ONLY.
Assume Chunk 1 (Prisma models + migration) is already merged.

SCOPE
Implement CRUD-ish endpoints for ParkingSlot + “available slots” listing.
Do NOT implement ParkingAllocation logic in this chunk.

MODULE
Create: src/modules/parking/
- parking.module.ts
- parking.controller.ts
- parking.service.ts
- parking.repo.ts
- dto/ (request/response DTOs)

Follow repo conventions:
- Controllers should be org-scoped and use guards:
  @UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)
- Gate endpoints with @RequirePermissions(...)
- Use PrismaService via repo layer (like other modules)
- Always scope DB queries by orgId from @CurrentUser

PERMISSIONS (use these exact keys)
- parkingSlots.create
- parkingSlots.read
- parkingSlots.update

ENDPOINTS

1) Create a slot
POST /buildings/:buildingId/parking-slots
Perm: parkingSlots.create
Body DTO:
{
  code: string,
  level?: string,
  type: "CAR" | "BIKE" | "EV",
  isCovered?: boolean,
  isActive?: boolean
}
Rules:
- Ensure buildingId belongs to the user’s org scope (orgId).
- Enforce unique per building: (buildingId, code). If conflict -> 409.
- Persist orgId/buildingId on the slot.

2) List slots (optionally filter available)
GET /buildings/:buildingId/parking-slots?available=true|false
Perm: parkingSlots.read
Rules:
- Ensure buildingId in org.
- If available=true: return only slots that have NO active allocation
  (i.e. no ParkingAllocation where parkingSlotId = slot.id AND endDate IS NULL)
- If available is omitted/false: return all slots in building (respect orgId/buildingId)
- Include basic fields: id, code, level, type, isCovered, isActive, createdAt
(Do not include allocations in response for now.)

3) Update a slot
PATCH /parking-slots/:slotId
Perm: parkingSlots.update
Body DTO (all optional):
{
  code?: string,
  level?: string | null,
  type?: "CAR" | "BIKE" | "EV",
  isCovered?: boolean,
  isActive?: boolean
}
Rules:
- Fetch slot by slotId + orgId (404 if not found).
- Update fields.
- If code changes, enforce unique (buildingId, code); conflict -> 409.

IMPLEMENTATION NOTES
- Add repo methods for create/find/update/list.
- For “available=true” query, do it efficiently:
  - Prisma findMany on ParkingSlot with a relation filter on allocations:
    where: { orgId, buildingId, allocations: { none: { endDate: null } } }
  (Adjust relation name to whatever was defined in schema: allocations/assignments etc.)
- Use DTO validation with class-validator; Swagger decorators consistent with repo patterns.
- Return consistent HTTP errors:
  - 403 missing perms
  - 404 org-scoped not found
  - 409 unique conflict

DELIVERABLES
- New parking module wired into app.module.ts if needed (or feature module import pattern used in repo)
- DTOs + controller/service/repo
- Minimal unit/e2e tests OPTIONAL (ok to skip in this chunk if repo expects later), but code must compile and lint.

DO NOT
- Add ParkingAllocation create/end endpoints (Chunk 3)
- Add Vehicle endpoints (Chunk 4)
- Add seed/permission mapping changes (Chunk 5)
- Add docs updates (later)

Stop after ParkingSlot endpoints compile and work.
