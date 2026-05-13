# Owner Portfolio Architecture Decisions

Last updated: April 5, 2026

## Goal

Add multi-org owner portfolio access without weakening tenant isolation.

The target runtime model is:

User
-> OwnerAccessGrant
-> Owner
-> Party
-> UnitOwnership
-> Unit

Meaning of each layer:

- `Party`: global identity and dedupe layer only
- `Owner`: org-scoped ownership/business record
- `OwnerAccessGrant`: explicit login access for a user to act as an owner
- `UnitOwnership`: ownership history and current owned-unit scope

## Frozen Decisions

### Identity and access

- `Party` is the global identity/dedupe layer.
- `Owner` stays org-scoped.
- `OwnerAccessGrant` is the only thing that grants owner runtime access.
- Matching email, phone, name, or identifier must never grant access by itself.
- Owner portfolio uses the existing login/JWT flow, but a different authorization path from `/org/*`.

### Ownership model

- `UnitOwnership` becomes the long-term source of truth.
- `Unit.ownerId` is kept temporarily as a current-owner pointer during migration.
- Unit owner writes are dual-written for a transition period.
- Reads move gradually from `Unit.ownerId` to `UnitOwnership`.

### Grant lifecycle

- Allowed transitions in v1:
  - `PENDING -> ACTIVE`
  - `PENDING -> DISABLED`
  - `ACTIVE -> DISABLED`
- No in-place reactivation in v1. Restoring access later creates a new grant row.
- `resend-invite` is allowed only for `PENDING` grants.
- If an owner already has an `ACTIVE` grant, creating another active representative fails. Explicit disable is required first.

### Grant uniqueness

- One owner has only one `ACTIVE` representative in v1.
- One `(userId, ownerId)` pair can have many historical rows.
- Only one `PENDING` or `ACTIVE` row per `(userId, ownerId)` is allowed.
- Historical disabled rows are allowed.

### Visibility

- Runtime access requires all of:
  - authenticated user
  - `OwnerAccessGrant.status = ACTIVE`
  - `Owner.isActive = true`
  - current owned-unit scope
- Disabling a grant removes owner visibility immediately.
- Inactive owners also remove runtime access immediately.
- Current ownership only is the v1 visibility rule.

### Messaging and notifications

- Request-linked messaging is out of v1.
- Cross-org owner notifications are out of v1.

### Sensitive identifiers

- `resolve-party` accepts strong identifiers only:
  - Emirates ID
  - passport
  - trade license
  - VAT/TRN
  - approved future strong identifiers
- No lookup by name, email, or phone.
- Identifier handling is exact-match only, normalized per type, encrypted at rest, matched by keyed HMAC, masked in responses, and audited.
- If an owner was created without a strong identifier and a later strong identifier matches another `Party`, do not silently merge or relink. Route to manual conflict handling.

### Resolution token

- `resolve-party` returns masked summary plus a short-lived signed stateless token.
- Recommended token fields:
  - actor user id
  - org id
  - matched party id
  - identifier type
  - issued at
  - expiry
- TTL: 10 minutes.

## Current Repo Constraints

### Auth and org scoping

Current auth is effectively single-org:

- `User` has a single `orgId` in `prisma/schema.prisma`.
- JWT validation resolves one effective org in `src/modules/auth/auth-validation.service.ts`.
- `OrgScopeGuard` rejects requests without `user.orgId` in `src/common/guards/org-scope.guard.ts`.

Implication:

- `/owner/*` cannot reuse `OrgScopeGuard`.
- `/owner/*` must authenticate normally, then resolve owner scope from grants and ownership.

### Current owner model

Current `Owner` is a minimal org-scoped contact record:

- `id`
- `orgId`
- `name`
- `email`
- `phone`
- `address`

Current owner APIs under `src/modules/owners/*` provide:

- org-scoped fuzzy search by name/email/phone/address
- simple org-scoped owner creation

Implication:

- Existing `/org/owners` remains the org-local management surface.
- Global identity resolution must be a separate admin flow, not an extension of the fuzzy owner search endpoint.

### Current ownership model

Current ownership is only:

- `Unit.ownerId`

There is no ownership history table yet.

Implication:

- `UnitOwnership` is a brand-new subsystem, not a refactor of an existing one.
- The current owner pointer must remain during migration to avoid breaking existing unit flows.

### Current maintenance request lifecycle

Current maintenance requests are resident/staff oriented:

- residents create requests from active occupancy
- building ops read/assign/update status
- request lifecycle is `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELED`

The original repo had no owner approval state and no owner-facing request runtime access.

Implication:

- owner approval cannot piggyback resident/staff lifecycle status fields
- owner request visibility and approval must remain scoped by current ownership plus active grants

### Current messaging model

Current messaging stores:

- org-scoped conversations
- optional building scope
- explicit participants

There is no request link.

Implication:

- owner private messaging should reuse explicit participant membership
- when needed later, prefer a direct `requestId` relation on `Conversation`

### Current notifications model

Current notifications are org-bound:

- notification listing filters by `(userId, orgId)`
- websocket notifications require resolved `user.orgId`

Implication:

- cross-org owner notifications are deferred
- v1 does not change the current notification model

### Contracts and legal snapshots

Contracts currently store owner/landlord snapshot fields:

- `ownerNameSnapshot`
- `landlordNameSnapshot`
- `landlordEmailSnapshot`
- `landlordPhoneSnapshot`

Those fields are legal/historical snapshot data, not live owner identity.

Implication:

- do not overwrite or reinterpret contract snapshot semantics in v1
- if contract data is shown later in owner portfolio, it must be labeled as contract-time data

## Foundation v1 Scope

### Included

- `Party`
- `PartyIdentifier`
- `Owner.partyId`
- `OwnerAccessGrant`
- `UnitOwnership`
- admin owner resolution/create/grant endpoints
- separate `/owner/*` auth path
- read-only `GET /owner/portfolio/units`
- minimal `GET /owner/portfolio/summary`

### Excluded

- portfolio requests
- owner approval actions
- request-linked messaging
- cross-org notifications
- party merge tooling
- in-place grant reactivation

## Shipped Post-v1 Slices

### Slice 2: Read-only owner requests

- `GET /owner/portfolio/requests`
- `GET /owner/portfolio/requests/:requestId`

Rules:

- read-only only
- visibility is derived from the same current owner unit scope as `/owner/portfolio/units`
- disabled grants and inactive owners revoke access immediately
- same `Party` in another org does not grant visibility without a separate grant
- ownership reassignment changes request visibility according to current ownership only

### Slice 3: Owner approval workflow

- management can require owner approval, request it, resend it, and override it for urgent/emergency paths
- owners can approve or reject only while grant scope, owner activity, and current ownership scope still hold
- `PENDING` blocks assignment and active execution progression
- `REJECTED` keeps the request visible but execution-blocked
- `APPROVED` unlocks assignment and execution progression
- audit rows are written for require, request, resend, approve, reject, and override actions

### Slice 4A: Owner request comments

- owners can read `SHARED` comments on requests inside current owner scope
- owners can add `SHARED` comments on requests inside current owner scope
- owners cannot read `INTERNAL` comments
- ownership reassignment revokes old owner comment access immediately

### Slice 4B: Owner private messaging

- owners can start private conversations with management for currently accessible units
- owners can start private conversations with tenants only when the tenant is actively assigned to that same accessible unit
- private conversation visibility is by explicit participant membership only
- owners cannot browse an org-wide tenant directory through messaging routes
- request-linked messaging remains deferred

## Smallest Shippable v1

### Ship

- Party foundation
- secure identifier lookup
- owner access grants
- owner auth path
- unit ownership migration
- read-only owner portfolio summary
- read-only owner portfolio units

### Do not ship yet

- requests
- approvals
- conversations
- notifications

## Proposed Schema Changes

### Party

Suggested fields:

- `id`
- `type` (`INDIVIDUAL | COMPANY`)
- `displayNameEn`
- `displayNameAr?`
- `primaryEmail?`
- `primaryPhone?`
- `status`
- `createdAt`
- `updatedAt`

### PartyIdentifier

Suggested fields:

- `id`
- `partyId`
- `identifierType`
- `countryCode?`
- `issuingAuthority?`
- `valueEncrypted`
- `lookupHmac`
- `last4?`
- `isPrimary`
- `isVerified`
- `normalizationVersion`
- `createdAt`
- `updatedAt`
- `deletedAt?`

### Owner extension

Add:

- `partyId` nullable first
- `isActive`
- optional org-local fields:
  - `displayNameOverride?`
  - `contactEmailOverride?`
  - `contactPhoneOverride?`
  - `notes?`

### OwnerAccessGrant

Suggested fields:

- `id`
- `userId`
- `ownerId`
- `status`
- `inviteEmail?`
- `invitedAt?`
- `acceptedAt?`
- `grantedByUserId?`
- `disabledAt?`
- `disabledByUserId?`
- `verificationMethod?`
- `createdAt`
- `updatedAt`

### OwnerRegistryLookupAudit

Suggested fields:

- `id`
- `actorUserId`
- `actorOrgId`
- `identifierType`
- `lookupHmac`
- `resultStatus`
- `matchedPartyId?`
- `createdAt`

### UnitOwnership

Suggested fields:

- `id`
- `orgId`
- `unitId`
- `ownerId`
- `startDate`
- `endDate?`
- `isPrimary?`
- `createdAt`
- `updatedAt`

## Migration Strategy

### Phase A: identity and access foundation

Add:

- `Party`
- `PartyIdentifier`
- nullable `Owner.partyId`
- `Owner.isActive`
- `OwnerAccessGrant`
- `OwnerRegistryLookupAudit`

Backfill:

- create one `Party` per existing `Owner`
- set `Owner.partyId`
- do not merge duplicate owners across orgs

### Phase B: ownership history

Add:

- `UnitOwnership`

Backfill:

- one active `UnitOwnership` row from each current `Unit.ownerId`
- `startDate = migration timestamp`
- optionally store a source marker such as `BACKFILL_FROM_UNIT_OWNER_ID` if schema allows later

### Phase C: dual-write and read migration

- `Unit.ownerId` remains temporarily
- unit owner writes must dual-write `Unit.ownerId` and `UnitOwnership`
- scope service should read `UnitOwnership`
- if `UnitOwnership` is missing due to incomplete migration, temporarily fall back to `Unit.ownerId`
- remove fallback after backfill validation passes

### Core integrity rule

If `Unit.ownerId = X`, there must be exactly one active `UnitOwnership` row for that unit with `ownerId = X`.

## Guard and Authorization Strategy

### `/org/*`

Unchanged:

- existing JWT auth
- existing org scope guard
- existing org/building RBAC

### `/owner/*`

New runtime path:

- authenticate with existing JWT flow
- do not require org in route or `OrgScopeGuard`
- resolve active owner grants
- resolve active owner records
- resolve current unit scope
- authorize through owner scope service

Owner runtime access must not consult org role templates or `effectivePermissions`.

## Proposed Initial Routes

### Admin routes

- `POST /org/owners/resolve-party`
- `POST /org/owners`
- `POST /org/owners/{ownerId}/access-grants`
- `POST /org/owners/{ownerId}/access-grants/link-existing-user`
- `POST /org/owners/{ownerId}/access-grants/{grantId}/disable`
- `POST /org/owners/{ownerId}/access-grants/{grantId}/resend-invite`

### Owner routes

- `GET /owner/portfolio/units`
- `GET /owner/portfolio/summary`
- `GET /owner/portfolio/requests`
- `GET /owner/portfolio/requests/:requestId`
- `POST /owner/portfolio/requests/:requestId/approve`
- `POST /owner/portfolio/requests/:requestId/reject`
- `GET /owner/portfolio/requests/:requestId/comments`
- `POST /owner/portfolio/requests/:requestId/comments`

## Initial Response Contracts

### `GET /owner/portfolio/units`

Each row should include at minimum:

- `orgId`
- `orgName`
- `ownerId`
- `unitId`
- `buildingId`
- `buildingName`
- `unitLabel`

Owner runtime access rules:

- authenticated user only
- access is granted by `OwnerAccessGrant.status = ACTIVE`
- owner must remain `isActive = true`
- access is grant-driven, not derived from `orgId`
- same `Party` in another org does not grant access without a separate grant
- scope resolves from active `UnitOwnership` rows first
- fallback to `Unit.ownerId` is migration-only and applies only when no active `UnitOwnership` row exists

### `GET /owner/portfolio/summary`

v1 should only return exactly:

- `unitCount`
- `orgCount`
- `buildingCount`

### Owner request approval contract

`ownerApproval` is now a shared snapshot on management and owner request responses.

Exact fields:

- `status`
- `requestedAt`
- `requestedByUserId`
- `deadlineAt`
- `decidedAt`
- `decidedByOwnerUserId`
- `reason`
- `requiredReason`
- `estimatedAmount`
- `estimatedCurrency`
- `decisionSource`
- `overrideReason`
- `overriddenByUserId`

Approval status enum:

- `NOT_REQUIRED`
- `PENDING`
- `APPROVED`
- `REJECTED`

Decision source enum:

- `OWNER`
- `MANAGEMENT_OVERRIDE`
- `EMERGENCY_OVERRIDE`

Blocking rules:

- `PENDING` blocks assignment to staff/vendor
- `PENDING` blocks progression into active execution states
- `REJECTED` keeps request visible but execution-blocked
- `APPROVED` unlocks assignment and execution

Override rules:

- normal request: no override
- urgent request: management override only after deadline expiry
- emergency request: immediate override allowed

### Owner request comment contract

Comment response fields:

- `id`
- `requestId`
- `author`
- `message`
- `visibility`
- `createdAt`

`author` fields:

- `id`
- `name`
- `email`
- `type`
- `ownerId`

Comment author types:

- `OWNER`
- `TENANT`
- `STAFF`
- `SYSTEM`

Comment visibility values:

- `SHARED`
- `INTERNAL`

Rules:

- owners can read only `SHARED` comments
- owners can create only `SHARED` comments
- building ops can create `SHARED` or `INTERNAL` comments
- residents can create only `SHARED` comments

## Proposed File Touch List

### New/extended schema and config

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `.env.example`
- `src/config/env.schema.ts`
- `src/config/env.ts`

### New identity/access modules

- `src/modules/parties/*`
- `src/modules/owners/owner-provisioning.service.ts`
- `src/modules/owners/owner-access-grant.service.ts`
- `src/modules/owners/owner-party-resolution.controller.ts`
- `src/modules/owners/owner-access-grants.controller.ts`

### Existing owner module updates

- `src/modules/owners/owners.module.ts`
- `src/modules/owners/owners.controller.ts`
- `src/modules/owners/owners.service.ts`
- `src/modules/owners/owners.repo.ts`
- `src/modules/owners/dto/*`

### Ownership history and unit integration

- `src/modules/unit-ownerships/*`
- `src/modules/units/units.service.ts`
- `src/modules/units/units.repo.ts`

### Owner runtime path

- `src/modules/owner-portfolio/*`
- `src/common/guards/owner-portfolio.guard.ts`
- `src/app.module.ts`

### Tests and docs

- `test/owner-party-resolution.e2e.spec.ts`
- `test/owner-access-grants.e2e.spec.ts`
- `test/unit-ownership-migration.e2e.spec.ts`
- `test/owner-portfolio.e2e.spec.ts`
- `docs/API.md`

## Deferred Items

### Explicitly deferred after Slice 4B

- owner maintenance request creation
- owner request attachments upload
- request-linked messaging
- cross-org owner notifications
- party merge/reassociation tooling

### Shipped request, approval, comment, and private messaging scope

Current shipped owner request scope is limited to:

- `GET /owner/portfolio/requests`
- `GET /owner/portfolio/requests/:requestId`
- `POST /owner/portfolio/requests/:requestId/approve`
- `POST /owner/portfolio/requests/:requestId/reject`
- `GET /owner/portfolio/requests/:requestId/comments`
- `POST /owner/portfolio/requests/:requestId/comments`
- `POST /owner/messages/management`
- `POST /owner/messages/tenants`
- `GET /owner/conversations`
- `GET /owner/conversations/:id`
- `POST /owner/conversations/:id/messages`
- `POST /owner/conversations/:id/read`
- `POST /org/buildings/:buildingId/requests/:requestId/owner-approval/require`
- `POST /org/buildings/:buildingId/requests/:requestId/owner-approval/request`
- `POST /org/buildings/:buildingId/requests/:requestId/owner-approval/resend`
- `POST /org/buildings/:buildingId/requests/:requestId/owner-approval/override`

Still excluded:

- request-linked messaging
- cross-org owner notifications
- owner request creation
- owner request attachments upload
- notifications

### Later design notes

- Request-linked messaging should use a direct `requestId` relation instead of implicit linking by owner/building scope.
- Cross-org owner notifications will require a non-org-bound notification model; current notification storage is org-bound.

## Test Plan by Area

### 10.1 Identity

- Exact-match identifier reuses existing `Party` in provisioning flows.
- Weak owner creation without a strong identifier creates a separate `Party`.
- Raw identifier values are never returned in API responses and never stored in audit rows.
- Current coverage:
  - `test/owner-party-resolution.e2e.spec.ts`
  - `test/owner-provisioning.e2e.spec.ts`
  - `src/modules/parties/party-resolution.service.spec.ts`
  - `src/modules/parties/party-identifier.service.spec.ts`

### 10.2 Grants

- One active representative per owner is enforced.
- Pending/active uniqueness for `(userId, ownerId)` is enforced.
- Resend invite is allowed only for `PENDING`.
- Disabling a grant removes owner runtime access immediately.
- Current coverage:
  - `src/modules/owners/owner-access-grant.service.spec.ts`
  - `test/owner-access-grants.e2e.spec.ts`
  - `test/owner-portfolio.e2e.spec.ts`

### 10.3 Ownership

- Backfill from `Unit.ownerId` creates current active `UnitOwnership` rows.
- Dual-write keeps `Unit.ownerId` and `UnitOwnership` aligned.
- Invariant holds: one active ownership row for current owner pointer.
- Fallback to `Unit.ownerId` works only during migration when ownership row is missing.
- Current coverage:
  - `src/modules/unit-ownerships/unit-ownership.service.spec.ts`
  - `test/unit-ownership-migration.e2e.spec.ts`
  - `src/modules/owner-portfolio/owner-portfolio-scope.service.spec.ts`
  - `test/owner-portfolio.e2e.spec.ts`

### 10.4 Owner runtime

- `/owner/*` works without org route context (`OrgScopeGuard` not required).
- Visible units are only those in grant-derived owner scope.
- Disabled grants and inactive owners are excluded immediately.
- Owner request visibility and action rights follow current owner scope only.
- Current coverage:
  - `src/modules/owner-portfolio/owner-portfolio-scope.service.spec.ts`
  - `test/owner-portfolio.e2e.spec.ts`

### 10.5 Owner approvals

- Management can require, request, resend, and override owner approval.
- Owners can approve or reject only while current scope still applies.
- `PENDING` blocks assignment and execution progression.
- `REJECTED` remains visible but execution-blocked.
- `APPROVED` unlocks assignment and execution.
- Urgent timeout override and emergency immediate override are both audited.
- Current coverage:
  - `test/owner-request-approvals.e2e.spec.ts`
  - `src/modules/owner-portfolio/owner-portfolio-scope.service.spec.ts`

### 10.6 Owner comments

- Owners can read shared comments on in-scope requests.
- Owners can add shared comments on in-scope requests.
- Owners cannot see internal-only comments.
- Disabled grants, inactive owners, and ownership reassignment revoke comment access immediately.
- Current coverage:
  - `test/owner-portfolio.e2e.spec.ts`
  - `src/modules/owner-portfolio/owner-portfolio-scope.service.spec.ts`

### 10.7 Regression

- `/org/owners` fuzzy search remains org-local and management-facing.
- Current `/org/*` auth behavior remains org-scoped.
- Existing unit owner flows continue to work during transition.
- Current coverage:
  - `test/org-units.e2e.spec.ts`
  - `test/org-residents.e2e.spec.ts`
  - `test/contracts-controller-rbac.e2e.spec.ts`

## Suggested Ticket Breakdown

### Ticket A

Freeze architecture decisions and publish design doc.

### Ticket B

Add `Party`, `PartyIdentifier`, lookup audit model, and owner-to-party backfill.

### Ticket C

Add `OwnerAccessGrant` and enforce grant lifecycle/uniqueness rules.

### Ticket D

Build `resolve-party` and owner provisioning endpoints.

### Ticket E

Build `/owner/*` auth guard path and owner scope service.

### Ticket F

Add `UnitOwnership`, backfill, dual-write, and consistency validation.

### Ticket G

Build `GET /owner/portfolio/summary` and `GET /owner/portfolio/units`.

### Ticket H

Add tests, docs, and regression coverage.

## Risks and Assumptions

### Risks

- identity migration could be implemented too aggressively; avoid all auto-merge behavior
- dual-write bugs could desynchronize `Unit.ownerId` and `UnitOwnership`
- future contributors may try to thread owner access through org RBAC; this should be avoided

### Assumptions

- same JWT/login continues to be used for all user types
- owner runtime access can be introduced without changing current resident/staff flows
- contract snapshot semantics remain unchanged
- exact identifier matching is sufficient for v1 owner provisioning
