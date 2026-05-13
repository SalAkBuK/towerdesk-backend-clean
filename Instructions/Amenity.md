You are a backend Codex agent working in a NestJS + Prisma codebase. Implement Building-scoped Amenities + Unit Amenities assignment with “default selected” behavior for new units.

CONTEXT
- Existing org-scoped building/unit APIs already exist.
- Unit now has a detail endpoint + PATCH endpoint (recent unit expansion).
- Units list and /basic endpoints must remain minimal and backward compatible.
- Auth model: orgId in JWT; building access via global permissions OR building assignment (MANAGER/STAFF/BUILDING_ADMIN).
- Prisma models exist for Building and Unit (Unit has buildingId, etc).

NEW REQUIREMENT
Client wants:
1) A Building-level catalog of available amenities (e.g., Balcony, Shared Pool, Shared Gym, Parking, etc).
2) A join table to assign amenities to a unit:
   - unit_amenities(unitId, amenityId)
3) A “default selected” flag so that when creating a unit, common amenities (e.g., Balcony) are pre-selected for most units.
   - This should be modeled as a boolean on the Building amenities catalog (per-building defaults), not on the join table.

DATA MODEL (Prisma)
Add these models:

model BuildingAmenity {
  id         String   @id @default(uuid())
  buildingId String
  name       String
  isActive   Boolean  @default(true)
  isDefault  Boolean  @default(false) // pre-selected for new unit creation
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  building   Building @relation(fields: [buildingId], references: [id])
  unitLinks  UnitAmenity[]

  @@unique([buildingId, name])
  @@index([buildingId])
}

model UnitAmenity {
  unitId    String
  amenityId String
  createdAt DateTime @default(now())

  unit      Unit            @relation(fields: [unitId], references: [id], onDelete: Cascade)
  amenity   BuildingAmenity @relation(fields: [amenityId], references: [id], onDelete: Cascade)

  @@id([unitId, amenityId])
  @@index([amenityId])
}

MIGRATION
- Create a Prisma migration (SQL + schema.prisma updates).

API REQUIREMENTS

A) Building amenities catalog endpoints (building-scoped, org-guarded)
- GET   /org/buildings/:buildingId/amenities
  - Returns list of amenities for that building (id, name, isActive, isDefault)
- POST  /org/buildings/:buildingId/amenities
  - Body: { name: string, isDefault?: boolean, isActive?: boolean }
- PATCH /org/buildings/:buildingId/amenities/:amenityId
  - Body: { name?: string, isDefault?: boolean, isActive?: boolean }

B) Unit amenities assignment
Integrate into existing Unit detail + PATCH (preferred):
- GET /org/buildings/:buildingId/units/:unitId
  - Include amenityIds: string[] (and optionally amenities: {id,name}[] if you already use include patterns)
- PATCH /org/buildings/:buildingId/units/:unitId
  - Accept optional amenityIds?: string[]
  - Behavior: replace set transactionally:
    - validate all amenityIds belong to SAME buildingId as unit
    - delete removed links + insert missing links
If your repo prefers separate endpoints instead, add:
- PUT /org/buildings/:buildingId/units/:unitId/amenities { amenityIds: string[] }

DEFAULT SELECTION LOGIC (IMPORTANT)
In POST /org/buildings/:buildingId/units:
- Extend create-unit DTO with optional amenityIds?: string[]
- If amenityIds is PROVIDED (including empty []) => use exactly what is provided.
- If amenityIds is UNDEFINED / not present => auto-attach all BuildingAmenity where:
  buildingId = :buildingId AND isActive = true AND isDefault = true
This ensures:
- omitted amenityIds => apply defaults
- amenityIds: [] => intentionally none

ACCESS CONTROL
- Always validate buildingId belongs to orgId in JWT.
- Catalog endpoints require: buildings.write (or units.write) OR building manager assignment; follow existing permission/guard conventions.
- Read endpoints require: units.read (or buildings.read); follow existing patterns.
- Prevent cross-building linking: cannot attach an amenity from Building A to a Unit in Building B.

DTO + VALIDATION
- name: trimmed, non-empty, max length reasonable.
- amenityIds: array of uuid strings; allow empty.

RESPONSE CONTRACTS
- Do NOT change existing list and /basic endpoints response shapes (keep minimal).
- Only detail endpoint should include amenityIds / amenities.

DOCS
- Update API.md and swagger decorators to reflect:
  - new building amenities endpoints
  - amenityIds behavior in unit create and unit patch
  - clarify omitted vs empty array semantics

TESTS (Jest e2e, follow existing patterns)
Add/extend e2e tests covering:
1) Create unit with old body still works (no amenities field).
2) Default amenities applied when amenityIds is omitted:
   - Create building amenities with isDefault=true then create unit and assert unit has those links.
3) No defaults applied when amenityIds: [] explicitly sent.
4) Patch unit amenityIds replaces the set correctly.
5) Reject assigning amenityId from different building (403/400 as per conventions).
6) GET building amenities list returns isDefault flag.

DELIVERABLES
- schema.prisma + migration.sql
- amenities module (controller/service/repo + DTOs + response DTOs)
- unit detail & patch updated to include/accept amenityIds and persist join table
- unit create updated with defaulting logic
- docs updated
- e2e tests added/updated
