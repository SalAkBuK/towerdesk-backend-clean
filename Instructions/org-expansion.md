You are working in a NestJS + Prisma backend.

Goal: Extend Organization (Org) to store additional business information fields, without breaking existing platform-only org creation.

Repo facts (do not change):
- POST /platform/orgs is platform-only (PlatformAuthGuard). It currently creates org with CreateOrgDto (only name) and returns OrgResponseDto { id, name, createdAt, updatedAt }.
- Org profile updates are done via PATCH /org/profile (org.profile.write) using UpdateOrgProfileDto (currently name + logoUrl).
- No /platform org update endpoint exists. GET /platform/orgs returns all orgs ordered by createdAt desc (no pagination).
- Membership is via User.orgId + roles, no OrgMember table.

Implement the following:

1) Prisma schema changes (schema.prisma)
- Add nullable business fields to Org:
  - businessName String?
  - businessType OrgBusinessType?
  - tradeLicenseNumber String?
  - vatRegistrationNumber String?
  - registeredOfficeAddress String?
  - city String?
  - officePhoneNumber String?
  - businessEmailAddress String?
  - website String?
  - ownerName String?
- Add enum OrgBusinessType with values:
  OWNER
  PROPERTY_MANAGEMENT
  FACILITY_MANAGEMENT
  DEVELOPER
- Keep existing Org fields intact (id, name, logoUrl, createdAt, updatedAt etc).
- Run/create a Prisma migration (safe nullable columns only).

2) DTO changes
A) create-org.dto.ts
- Keep existing validation for name (string, min length 2).
- Add the new fields as OPTIONAL with class-validator:
  - businessName: optional string
  - businessType: optional enum (OrgBusinessType)
  - tradeLicenseNumber: optional string
  - vatRegistrationNumber: optional string
  - registeredOfficeAddress: optional string
  - city: optional string
  - officePhoneNumber: optional string
  - businessEmailAddress: optional email
  - website: optional url
  - ownerName: optional string
- Export or import the enum as needed so DTO compiles cleanly.

B) update-org-profile.dto.ts (used by PATCH /org/profile)
- Expand to allow updating these same fields (all optional) with the same validations.
- Keep name/logoUrl support unchanged.

3) Service/controller wiring
A) platform-orgs.service.ts (or wherever org is created for POST /platform/orgs)
- When creating org, map any provided optional fields into prisma.org.create data.
- Do NOT change response contract: platform create should still return OrgResponseDto (id, name, createdAt, updatedAt). (It can store extra fields but not return them unless already returned somewhere else.)

B) org-profile.service/controller (PATCH /org/profile)
- Ensure update logic can update the new fields on the org record.
- Keep permission requirement org.profile.write unchanged.

4) API docs
- Update API.md (or relevant docs) to mention POST /platform/orgs accepts the new optional fields.
- Update docs for PATCH /org/profile to include the new optional fields.
- Do not claim that POST /platform/orgs returns the new fields unless the code already returns them (it should remain OrgResponseDto).

5) Quality/safety
- Keep all new DB fields nullable to avoid breaking existing flows and existing org rows.
- Add minimal tests only if the repo already has a pattern for DTO/service tests; otherwise skip tests but ensure compilation passes.

After changes, provide:
- list of files changed
- migration name created
- brief note confirming old POST /platform/orgs with { name } still works.
