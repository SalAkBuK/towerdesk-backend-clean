# Org Profile Review

## Scope

- Source: `src/modules/org-profile`
- Main files:
  - `org-profile.controller.ts`
  - `org-profile.service.ts`
  - `dto/org-profile.response.dto.ts`
  - `dto/update-org-profile.dto.ts`
- Public routes:
  - `GET /org/profile`
  - `PATCH /org/profile`
- Core responsibility: return and update organization-level profile and business details.

## What This Module Really Owns

- Org identity and business profile fields stored on the `Org` entity.
- A narrow edit surface for updating org business metadata.
- Read access for any org-scoped authenticated user.

## Step-By-Step Request Flows

### 1. Get org profile

1. Controller accepts `GET /org/profile`.
2. Guards: `JwtAuthGuard`, `OrgScopeGuard`.
3. Reads `orgId` from request context.
4. Service fetches org by ID.
5. Missing org -> `404 Not Found`.
6. Response is mapped to `OrgProfileResponseDto`.

### 2. Update org profile

1. Controller accepts `PATCH /org/profile`.
2. Guards: `JwtAuthGuard`, `OrgScopeGuard`, `PermissionsGuard`.
3. Requires permission `org.profile.write`.
4. Reads `orgId` from request context.
5. DTO validation runs for any provided fields.
6. Service verifies org exists.
7. Org record is updated with any provided fields.
8. Response is mapped to `OrgProfileResponseDto`.

## Read Models And Response Shapes

### Org profile response

- `id`
- `name`
- `logoUrl`
- `businessName`
- `businessType` (enum `OrgBusinessType`)
- `tradeLicenseNumber`
- `vatRegistrationNumber`
- `registeredOfficeAddress`
- `city`
- `officePhoneNumber`
- `businessEmailAddress`
- `website`
- `ownerName`

### Update request body

- All fields optional, partial updates are supported:
  - `name` (min length 2)
  - `logoUrl` (https URL required)
  - `businessName`
  - `businessType` (enum)
  - `tradeLicenseNumber`
  - `vatRegistrationNumber`
  - `registeredOfficeAddress`
  - `city`
  - `officePhoneNumber`
  - `businessEmailAddress` (email validation)
  - `website` (URL)
  - `ownerName`

## Validation And Defaults

### Read permissions

- Any authenticated user with org scope can read the profile.

### Write permissions

- Update requires `org.profile.write`.
- Missing permission returns `403`.

### Field validation

- `name` requires at least 2 characters when provided.
- `logoUrl` requires HTTPS scheme.
- `businessEmailAddress` must be a valid email.
- `website` must be a valid URL.
- String fields allow empty strings unless constrained by validator.

## Data And State Model

### Core table touched

- `Org`

### Behavior notes

- The module is a thin CRUD wrapper over `Org`.
- No additional audit logging or history is recorded.
- No file upload; `logoUrl` is a direct URL string.

## Edge Cases And Important Scenarios

### Org not found

- Both `GET` and `PATCH` return `404` if the org record is missing.

### Partial updates

- Only provided fields are updated.
- Nullability is not explicitly supported by DTO, so “clearing” a value requires passing `null` and may fail validation depending on the field.

### HTTPS-only logo URLs

- `logoUrl` requires HTTPS with protocol.
- This can block use of internal http URLs or relative paths.

### Business data sensitivity

- Values may be used on contracts or invoices; changes should be intentional.

## Strengths

- Simple, well-scoped API.
- Clear separation between read access (all org users) and write access (permissioned).
- DTO validation prevents malformed emails and URLs.

## Risks And Design Weaknesses

### 1. No explicit audit trail

- Changes to sensitive business fields are not tracked.
- Hard to review who changed legal details.

### 2. Clearing fields is ambiguous

- DTOs do not explicitly allow `null`, which makes “unset” behavior unclear.
- Some fields may require additional handling if “clear” is needed.

### 3. Profile vs configuration boundaries

- Org profile data is likely to expand into settings/config.
- Without a boundary, this module can become a catch-all.

## Improvement Opportunities

### High priority

- Clarify whether fields can be cleared and how (null vs empty string).
- Add audit logging for sensitive business fields.

### Medium priority

- Consider separating business identity from app configuration settings.
- Add logo upload flow rather than raw URL write.

### Lower priority

- Add write constraints for critical fields (e.g., require approval for tax IDs).
- Add view-level caching if profile becomes hot on the frontend.

## Concrete Review Questions For Your Lead

1. Should org profile changes be audited and versioned?
2. Do we need an explicit “clear” semantics for optional fields?
3. Should logoUrl be managed by a file upload rather than arbitrary URLs?
4. Is `org.profile.write` sufficient, or do some fields need higher privilege?
5. Should business profile be split from future org settings?

## Testing Signals

### Integration coverage already present

- `test/org-profile.e2e.spec.ts`

### Notable cases already tested

- any org user can read profile
- org admins can update profile with permission
- non-admins are blocked
- org isolation in profile updates
