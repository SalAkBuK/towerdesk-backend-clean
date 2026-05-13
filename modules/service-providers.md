# Service Providers Review

## Scope

- Source: `src/modules/service-providers`
- Main files:
  - `service-providers.controller.ts`
  - `service-providers.service.ts`
  - `service-providers.repo.ts`
  - `provider-access-grants.controller.ts`
  - `provider-access-grant.service.ts`
  - `provider-access.service.ts`
  - `provider-portal.controller.ts`
  - `provider-portal.service.ts`
  - DTOs under `src/modules/service-providers/dto`
- Public routes:
  - Org management: `/org/service-providers/*`
  - Access grants: `/org/service-providers/:providerId/access-grants/*`
  - Provider portal: `/provider/*`
- Core responsibility: manage provider registry, link providers to buildings, and support provider-admin and provider-staff self-service.

## What This Module Really Owns

- Cross-org provider registry and building links.
- Provider admin onboarding via access grants and invites.
- Provider portal profile management.
- Provider staff membership management.
- Provider access gating based on grants and memberships.

## Important Architectural Notes

- Org routes use `JwtAuthGuard`, `OrgScopeGuard`, and `PermissionsGuard`.
- Provider portal routes use `JwtAuthGuard` plus provider membership access checks.
- Provider access grants double as an onboarding gate.
  - If a user has grants for a provider, they must have an ACTIVE grant to access that provider.
  - If there are no grant rows, membership alone is enough.
- Provider profile ownership flips after provider-admin access grants become active.

## Step-By-Step Request Flows

### 1. Org list and search

1. `GET /org/service-providers` requires `service_providers.read`.
2. Optional `search` matches name, category, contact fields.
3. Response includes:
   - `isLinkedToCurrentOrg`
   - linked building list scoped to current org
   - access grant list

### 2. Org create provider

1. `POST /org/service-providers` requires `service_providers.write`.
2. Normalizes and validates provider fields.
3. Validates each `buildingId` belongs to the org.
4. Creates provider and links buildings.
5. Optional `adminEmail` creates a pending provider-admin invite:
   - standalone user is created if necessary
   - access grant is created in `PENDING` status
   - password reset invite is issued (`PROVIDER_INVITE`)

### 3. Org update provider

1. `PATCH /org/service-providers/:providerId` requires `service_providers.write`.
2. Update is blocked if any ACTIVE provider access grant exists.
3. Otherwise fields are normalized and updated.

### 4. Link/unlink provider to building

1. `POST /org/service-providers/:providerId/buildings` links a building to the provider.
2. Link uses upsert; repeated links are safe.
3. `DELETE /org/service-providers/:providerId/buildings/:buildingId` removes the link.
4. Both routes require `service_providers.write`.

### 5. Provider access grants

1. `GET /org/service-providers/:providerId/access-grants` lists grant history.
2. `POST` creates a pending admin invite.
3. Only one open (PENDING or ACTIVE) grant is allowed at a time.
4. Admin email must belong to a standalone user (not org-scoped).
5. `POST :grantId/resend-invite` only for pending grants.
6. `POST :grantId/disable` sets status to DISABLED and records actor.

### 6. Provider portal: membership context

1. Provider portal access requires an ACTIVE membership.
2. If the user has multiple active provider memberships, portal flows require explicit selection and will return conflict otherwise.

### 7. Provider portal: profile

1. `GET /provider/profile` returns provider profile for the selected membership.
2. `PATCH /provider/profile` is ADMIN-only.
3. Updates normalize text fields and allow toggling provider active state.

### 8. Provider portal: staff

1. `GET /provider/staff` is ADMIN-only.
2. `POST /provider/staff`:
   - creates a standalone user with a temp password
   - creates provider membership with role and status
3. `PATCH /provider/staff/:userId`:
   - ADMIN-only
   - cannot modify own membership
   - updates role or membership active status

## Read Models And Response Shapes

### Org provider response

- Includes provider basics, org-linked buildings, access grants, and ownership flags.
- `providerProfileOwnedByProvider` is true when any ACTIVE grant exists.

### Provider portal response

- `ProviderMeResponseDto` lists all provider memberships for the user.
- `ProviderProfileResponseDto` returns provider profile details.
- `ProviderStaffResponseDto` includes membership and user status fields.

## Validation And Defaults

- Names are required and trimmed.
- Optional fields are normalized to `null` when empty.
- `buildingIds` are unique and must belong to the org.
- Provider staff emails must be unique and not already used.

## Data And State Model

### Core tables touched directly

- `ServiceProvider`
- `ServiceProviderBuilding`
- `ServiceProviderAccessGrant`
- `ServiceProviderUser`
- `User`

### External/domain side effects

- Provider invites trigger `AuthService.requestPasswordReset` with `PROVIDER_INVITE`.
- Provider access grants control portal visibility.

## Edge Cases And Important Scenarios

- A provider can be discovered by other orgs and linked without duplicating the provider record.
- Org-side updates are blocked once an admin grant is active.
- Provider access grants require standalone users; org users cannot be provider admins.
- Pending grants block portal access for that provider until activation.
- Multiple provider memberships require explicit selection for portal operations.
- Provider admins cannot modify their own membership record.

## Strengths

- Clean separation of org registry and provider portal behavior.
- Clear onboarding flow with explicit access grants.
- Cross-org reuse avoids duplicate provider records.

## Risks And Design Weaknesses

### 1. Ownership shift after admin activation can surprise org users

- Org-side updates are blocked once an admin grant is active.
- Without clear UX messaging, this can feel like a bug.

### 2. Access grant rules are subtle

- Memberships without grants are allowed, but grants require ACTIVE status.
- This dual mode requires clear operational guidance.

### 3. No explicit provider selection API

- Multiple memberships cause conflicts in portal flows.
- Clients must resolve ambiguity out of band.

## Improvement Opportunities

### High priority

- Add explicit provider-selection support in portal routes when multiple memberships exist.
- Add audit metadata for building link/unlink and provider staff changes.

### Medium priority

- Provide a status summary endpoint for provider admins (active grants, pending invites, staff counts).
- Add pagination and search on provider staff lists.

### Lower priority

- Move invite workflows to async jobs to decouple auth side effects.
- Add event emissions for access-grant lifecycle changes.

## Concrete Review Questions For Your Lead

1. Should org-side edits be allowed after admin activation, or should we expose a limited edit surface?
2. Do we want a first-class provider selection flow in the portal?
3. Is the “grant required only when grants exist” rule the right model long-term?
4. Do we need audit trails for staff changes and building links?

## Testing Signals

### Integration coverage already present

- `test/service-providers.e2e.spec.ts`

### Unit coverage already present

- `provider-access.service.spec.ts`
- `provider-access-grant.service.spec.ts`

### Notable cases already tested

- cross-org provider discovery and linking
- provider-admin invite creation and activation
- org-side updates blocked after admin activation
- provider-admin portal profile updates
- provider staff creation and disablement
