You are a backend Codex agent working in a NestJS + Prisma codebase. Implement the new Unit “master record” fields requested by the client while keeping the current platform/org flows backward-compatible.

CURRENT CONTEXT
- Existing Prisma model: Unit { id(uuid), buildingId, label, floor?, notes?, createdAt, updatedAt }
- Relations: Unit -> Building, Occupancy, MaintenanceRequest
- Constraint: @@unique([buildingId, label]) and @@index([buildingId])
- Existing org-scoped API:
  - POST /org/buildings/:buildingId/units  (body: { label, floor?, notes? })
  - GET  /org/buildings/:buildingId/units  (optional available=true)
  - GET  /org/buildings/:buildingId/units/basic (id + label only)
  - GET  /org/buildings/:buildingId/units/count (total, vacant)
- Auth rules: orgId in JWT; building access via global permissions OR building assignment (MANAGER/STAFF/BUILDING_ADMIN). Managers can create units if assigned.

NEW REQUIREMENTS (Units form fields)
- Unit Number/Code (use existing Unit.label as the code)
- Building (existing buildingId path param)
- Unit Type (Apartment/Shop/Office/Other) MUST come from a DB table so new values can be added later
- Owned by: link to an Owner entity (owner name/email/address/phone)
- Maintenance paid by: owner OR tenant
- Floor Number (existing floor)
- Unit Size (Sq Ft / Sq M)
- Bedrooms, Bathrooms
- Balcony (Yes/No)
- Kitchen Type (Open/Closed)
- Furnished Status (Unfurnished/Semi-Furnished/Fully Furnished)
- Rent Amount (Annual)
- Payment Frequency (Monthly/Quarterly/Semi-Annual)
- Security Deposit Amount
- Service Charge per Unit
- VAT Applicable (Yes/No)
- Electricity Meter Number, Water Meter Number, Gas Meter Number (optional)

GOALS
1) Schema: Add these fields to Unit (mostly nullable) and add new tables:
   - UnitType lookup table (org-scoped): id, orgId, name, isActive, timestamps; @@unique([orgId, name]); relation Unit.unitTypeId -> UnitType
   - Owner entity (org-scoped): id, orgId, name, email?, phone?, address?, timestamps; relation Unit.ownerId -> Owner
2) Enums in Prisma are OK for fixed sets except UnitType must be a table:
   - MaintenancePayer: OWNER | TENANT
   - KitchenType: OPEN | CLOSED
   - FurnishedStatus: UNFURNISHED | SEMI_FURNISHED | FULLY_FURNISHED
   - PaymentFrequency: MONTHLY | QUARTERLY | SEMI_ANNUAL
   - UnitSizeUnit: SQ_FT | SQ_M
3) API: Keep existing endpoints working:
   - POST /org/buildings/:buildingId/units must still accept old body and also accept new optional fields.
   - /units/basic must remain id+label only (do not leak extra fields).
   - List/count behavior unchanged unless necessary.
4) Add new endpoints to manage lookups:
   - GET /org/unit-types (list active types) and POST /org/unit-types (create new type) [guard with appropriate permission like unitTypes.write or admin; follow existing patterns]
   - GET /org/owners?search= and POST /org/owners (create) [guard similarly; follow patterns]
   - If your codebase prefers nesting under /org, keep it consistent.
5) Validation + DTOs: Use class-validator with sensible rules:
   - decimals: validate as numbers/strings consistent with existing DTO style; store in Prisma Decimal
   - integers non-negative where applicable (bedrooms/bathrooms/floor)
   - strings trimmed; meter numbers string
   - paymentFrequency required only if rentAnnual is provided? (keep optional; do not break)
6) Migration: Create a new Prisma migration. Also add a seed step to create default UnitTypes per org if you have a seed mechanism; otherwise add a note/TODO in docs. At minimum, ensure UnitType table exists and can be populated via API.
7) Docs: Update API.md / swagger decorators to show new optional fields on create/update.
8) Tests: Add e2e tests (or unit tests if that’s what repo uses) covering:
   - Create unit with old body still works
   - Create unit with new fields persists correctly
   - /units/basic only returns id+label
   - UnitType CRUD basics (list + create)
   - Owner create + search works

DELIVERABLES
- Prisma schema updates + migration SQL
- New models: UnitType, Owner
- Updated Unit DTOs/services/controllers to accept & persist new optional fields
- New modules/controllers/services/repos for UnitType and Owner (or integrated into existing units module if preferred)
- Updated docs
- Tests

IMPORTANT
- Do not change response contracts for existing endpoints (additive fields OK if already returning Unit DTO; but do not remove or rename existing fields).
- Ensure org scoping everywhere: cannot create/list UnitTypes or Owners across orgs.
- Ensure buildingId belongs to the org from JWT.
- Follow existing project conventions for folder structure, error handling, and permission guards.
