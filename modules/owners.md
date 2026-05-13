# Owners Review

## Scope

- Source: `src/modules/owners`
- Main files:
  - `owners.controller.ts`
  - `owners.service.ts`
  - `owners.repo.ts`
  - `owner-party-resolution.controller.ts`
  - `owner-provisioning.service.ts`
  - `owner-access-grants.controller.ts`
  - `owner-access-grant.service.ts`
- Public routes:
  - `GET /org/owners`
  - `POST /org/owners`
  - `PATCH /org/owners/:ownerId`
  - `POST /org/owners/resolve-party`
  - owner access grant routes under `/org/owners/:ownerId/access-grants`
- Core responsibility: maintain org-local owner records, resolve or reuse global party identity, and grant owner-portal access.

## What This Module Really Owns

- Org-scoped owner registry.
- Owner identity resolution against global party identifiers.
- Owner access-grant lifecycle and audit trail.
- Owner portal user creation and invite flow orchestration.

## Important Architectural Note

There are two related but distinct identity layers in this module:

- **Owner record**
  - org-scoped and mutable
- **Party record**
  - cross-org and identifier-backed

Owner creation can:

- reuse an existing party (via resolution token or identifier match)
- or create a new party

This is not only a CRUD module. It is a key piece of identity resolution and access control for owners.

## Step-By-Step Request Flows

### 1. List owners

Route: `GET /org/owners`

1. Requires `owners.read`.
2. Service derives org scope from the authenticated user.
3. Repo lists owners in org, ordered by `createdAt desc`.
4. Search is optional and matches:
   - `name`
   - `email`
   - `phone`
   - `address`
5. Response maps owner and party summary.
6. Identifier is shown as a masked `***last4` only.

### 2. Create owner

Route: `POST /org/owners`

1. Requires `owners.write`.
2. Service delegates to `OwnerProvisioningService.createOrReuseOwner(...)`.
3. Provisioning resolves party by one of three paths:
   - `resolutionToken`
   - `identifier` match
   - create new party
4. Owner record is created or updated for `(orgId, partyId)`.
5. Optional owner overrides are stored:
   - `displayNameOverride`
   - `contactEmailOverride`
   - `contactPhoneOverride`
   - `notes`
6. Response includes owner + party summary.

### 3. Update owner

Route: `PATCH /org/owners/:ownerId`

1. Requires `owners.write`.
2. Service verifies owner exists in org.
3. Updates are applied only to fields provided:
   - `name`
   - `email` (normalized)
   - `phone`
   - `address`
   - `isActive`
4. Response returns updated owner with party summary.

### 4. Resolve party by identifier

Route: `POST /org/owners/resolve-party`

1. Requires `owner_registry.resolve`.
2. Accepts a strong identifier type and value.
3. Resolution service normalizes and checks exact identifier match.
4. If no match:
   - `matchFound: false`
   - no resolution token
5. If match:
   - returns masked identifier only
   - returns short-lived resolution token
6. Resolution token is later used to reuse the matched party during owner create.

### 5. Owner access grants

Routes under `org/owners/:ownerId/access-grants`:

- `GET /` (list)
- `GET /history`
- `POST /` (invite by email)
- `POST /link-existing-user`
- `POST /:grantId/activate`
- `POST /:grantId/disable`
- `POST /:grantId/resend-invite`

#### Create invite

1. Requires `owner_access_grants.write`.
2. Owner must be active.
3. Owner must have no active representative.
4. Email is normalized.
5. If user with that email exists and active:
   - grant is created as `ACTIVE`
   - verification method `EMAIL_MATCH`
6. Otherwise:
   - new owner-portal user is created (`orgId = null`)
   - grant is created as `PENDING`
   - invite email is sent via `AuthService.requestPasswordReset(...)`
7. Audit row is created.

#### Link existing user

1. Requires `owner_access_grants.write`.
2. Owner must be active and have no active representative.
3. User must exist and be active.
4. Grant is created as `ACTIVE` with `verificationMethod = ADMIN_LINK`.
5. Audit is created.
6. Notification sent to linked user.

#### Activate pending grant

1. Requires `owner_access_grants.write`.
2. Owner must be active and have no active representative.
3. Grant must exist and be `PENDING`.
4. User must exist and be active.
5. Grant is updated to `ACTIVE`.
6. Audit is created.
7. Notification sent to linked user.

#### Disable grant

1. Requires `owner_access_grants.write`.
2. Grant must exist and not already be disabled.
3. Grant is updated to `DISABLED`.
4. Audit is created.
5. Notification sent to previous user if present.

#### Resend invite

1. Requires `owner_access_grants.write`.
2. Grant must be `PENDING`.
3. Grant must have `inviteEmail` and `userId`.
4. `invitedAt` is updated.
5. Audit is created.
6. Invite email is resent via `AuthService.requestPasswordReset(...)`.

## Data And State Model

### Owner

- org-scoped owner record
- can be linked to a global `Party`
- has optional display/contact overrides

### Party (global identity)

- shared across orgs
- identifier-based
- can be reused across multiple owner records in different orgs

### OwnerAccessGrant

- one active representative per owner
- statuses: `PENDING`, `ACTIVE`, `DISABLED`
- transitions are audited in `OwnerAccessGrantAudit`

## Access Model

### Owners

- list: `owners.read`
- create/update: `owners.write`

### Party resolution

- `owner_registry.resolve`

### Owner access grants

- list/history: `owner_access_grants.read`
- invite/link/activate/disable/resend: `owner_access_grants.write`

## Edge Cases And Important Scenarios

### 1. Owner identity reuse depends on exact identifier match

- Party reuse only happens via:
  - resolution token, or
  - exact strong identifier match

If neither is supplied, a new party is created even if another org already has the same person.

### 2. Resolution tokens are the safe reuse mechanism

- `resolve-party` returns masked identifier and a signed token.
- Raw identifiers are not returned.
- Tokens are required to reuse matched parties without re-sending identifiers.

### 3. Owner is reused within org by `(orgId, partyId)`

- If an owner already exists in the org with the same party, it is updated rather than created.

### 4. Only one active representative per owner

- any attempt to create a second active grant fails
- pending grants must be disabled before a new one can be created

### 5. Invite and link logic can auto-activate

- if an active user with matching email exists, the grant is created as `ACTIVE` immediately
- this includes users with `orgId = null` as well as org users

### 6. Inactive users cannot be linked or invited

- if a user is found but inactive, invite is rejected

### 7. Resend only works for pending email-based grants

- `PENDING` + `inviteEmail` + `userId` required
- active or disabled grants cannot be resent

### 8. Identifier masking is last4 only

- owner responses show only a masked `***last4` identifier summary
- the underlying full identifier is never exposed

## Cross-Module Dependencies

### Parties

- party resolution and identifier services are used for strong identifier matching
- resolution tokens are signed and verified via party-resolution token service

### Auth

- owner invite uses password-reset flow with purpose `OWNER_INVITE`

### Notifications

- access grant activation and disablement notify the owner user

## Strengths

- Owner identity resolution is explicit and does not leak raw identifiers.
- Access grant lifecycle is fully audited.
- Single active representative rule avoids ambiguous ownership in owner portal.
- Reuse logic prevents duplicate owners within the same org for the same party.
- Clear separation between owner CRUD and access-grant workflows.

## Risks And Design Weaknesses

### 1. Resolution and owner creation are tightly coupled

- owner create may create parties and identifiers directly
- that increases coupling between registry and identity resolution

### 2. Cross-org user linking is possible by email

- auto-link by email does not enforce orgId
- this is likely intended for owner portal users, but it is still a policy decision that should be explicit

### 3. Single active representative may be too strict long-term

- business may eventually want multiple owner representatives
- current logic blocks that entirely

### 4. Owner updates do not touch party data

- updates only change the owner record, not party identity fields
- this is correct by design, but can surprise operators who expect party-level changes

### 5. Resolution tokens are required for safe reuse

- if teams skip `resolve-party`, duplicate party creation is easy
- the UI and docs must guide the correct flow

## Improvement Opportunities

### High priority

- Document the intended owner identity flow clearly in product/admin docs.
- Decide whether multiple active representatives should be allowed per owner.
- Make cross-org linking behavior explicit in documentation and policy.

### Medium priority

- Add observability around owner invite delivery and activation rates.
- Provide a UI/admin surface for resolving duplicate owners or mismatched party data.
- Consider a safer partial update flow for owner overrides rather than full update semantics.

### Lower priority

- Add pagination to owner list if owner counts grow large.
- Add additional masked identifier metadata if required by operations.

## Concrete Review Questions For Your Lead

1. Is one active owner representative the correct long-term policy?
2. Should owner portal users be allowed to link by email even if their `orgId` is non-null?
3. Do we want owner updates to ever write back to party identity records?
4. Is the `resolve-party` token flow enforced strongly enough in the UI and API usage patterns?
5. Should the owner registry become its own submodule separate from access grants?

## Testing Signals

### Main coverage already present

- `src/modules/owners/owners.service.spec.ts`
- `src/modules/owners/owner-access-grant.service.spec.ts`
- `test/owner-provisioning.e2e.spec.ts`
- `test/owner-access-grants.e2e.spec.ts`
- `test/owner-party-resolution.e2e.spec.ts`

### Notable cases already tested

- exact identifier reuse through party resolution
- resolution token reuse
- duplicate owner prevention within org
- owner overrides on create
- access grant auto-link by email
- active representative restriction
- duplicate open grant prevention
- grant history filtering
- resend constraints for pending-only invites
- masked identifier output and no raw identifier leakage

## Suggested Follow-On Docs

- A short diagram of owner identity flow: resolve -> token -> create/reuse.
- A lifecycle diagram for owner access grants and audit actions.
