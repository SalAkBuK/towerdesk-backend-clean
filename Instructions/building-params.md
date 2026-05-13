You are Codex working in a NestJS + Prisma + Postgres codebase.

Goal
Update the Building model + API so “Create Building” supports demo-ready UAE-friendly params (name + location metadata). Implement the schema migration, DTO validation, Swagger docs, and e2e tests. Keep changes additive and backwards-compatible.

Current Prisma model (existing)
model Building {
  id        String   @id @default(uuid())
  orgId     String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  org       Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  units     Unit[]
  assignments BuildingAssignment[]
  occupancies Occupancy[]
  maintenanceRequests MaintenanceRequest[]

  @@index([orgId])
}

What to add (demo-ready fields)
Add these columns to Building:
- city: String (required for create)
- emirate: String? (optional)
- country: String with default "AE"
- timezone: String with default "Asia/Dubai"
- floors: Int? (optional)
- unitsCount: Int? (optional)

Updated Prisma model target
model Building {
  id        String   @id @default(uuid())
  orgId     String

  name      String
  city      String
  emirate   String?
  country   String   @default("AE")
  timezone  String   @default("Asia/Dubai")
  floors     Int?
  unitsCount Int?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  org       Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  units     Unit[]
  assignments BuildingAssignment[]
  occupancies Occupancy[]
  maintenanceRequests MaintenanceRequest[]

  @@index([orgId])
}

API
Create building endpoint (use existing route conventions; if not present, add):
POST /api/org/buildings
Request body (demo):
{
  "name": "Marina Heights Tower A",
  "city": "Dubai",
  "emirate": "Dubai",
  "country": "AE",
  "timezone": "Asia/Dubai",
  "floors": 45,
  "unitsCount": 380
}

Rules
- orgId MUST come from org scope / request context (OrgScopeGuard / context), not from request body.
- Defaults:
  - country defaults to "AE" if omitted
  - timezone defaults to "Asia/Dubai" if omitted
- Validate:
  - name: required, trimmed, min 2 chars
  - city: required, trimmed, min 2 chars
  - emirate: optional
  - country: optional but if provided must be 2-letter uppercase code (for demo allow only "AE" or just validate /^[A-Z]{2}$/)
  - timezone: optional; for demo accept string, but default to "Asia/Dubai"
  - floors/unitsCount: optional ints >= 1

Implementation steps
1) Prisma:
   - Update schema.prisma with the new fields.
   - Create and apply migration.
   - Ensure existing rows are backfilled safely:
     - set city to "Unknown" (or empty) for existing buildings OR make city nullable temporarily then add a follow-up migration.
   Preferred: make city nullable in DB migration if needed, but keep DTO requiring city for new creates. (Do whatever is least risky for existing data.)
2) DTO:
   - Create/update CreateBuildingDto with class-validator.
   - Ensure Swagger decorators reflect required vs optional fields.
3) Service/controller:
   - Update create-building handler to accept the new fields.
   - When persisting:
     - use dto.country ?? "AE"
     - use dto.timezone ?? "Asia/Dubai"
     - trim strings
4) Responses:
   - Return the created Building including the new fields.
5) Tests:
   Add e2e tests for:
   - creates building with minimal body { name, city } and defaults country/timezone
   - creates building with full body (all fields)
   - rejects missing city (400)
   - rejects floors=0 or unitsCount=0 (400)

Notes
- Keep existing endpoints working; do not require city for existing read/update paths unless you also update them.
- Follow existing module structure, naming conventions, and guards.

Deliverables
- Prisma schema + migration
- Updated controller/service/DTOs + Swagger docs
- New/updated e2e tests
