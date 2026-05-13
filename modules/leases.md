# Leases Review

## Scope

- Source: `src/modules/leases`
- Main files:
  - `contracts.controller.ts`
  - `contracts.service.ts`
  - `lease-lifecycle.controller.ts`
  - `lease-lifecycle.service.ts`
  - `leases.controller.ts`
  - `leases.service.ts`
  - `lease-documents.controller.ts`
  - `lease-documents.service.ts`
  - `lease-access-cards.controller.ts`
  - `lease-access-cards.service.ts`
  - `lease-parking-stickers.controller.ts`
  - `lease-parking-stickers.service.ts`
  - `lease-occupants.controller.ts`
  - `lease-occupants.service.ts`
  - `resident-contract.controller.ts`
  - `resident-lease.controller.ts`
- Public routes span:
  - org contract drafting and review
  - org lease reads and updates
  - direct move-in and move-out execution
  - lease documents, occupants, access cards, parking stickers
  - resident contract views, resident move requests, resident upload flows
  - resident active lease and active lease documents
- Core responsibility: lease and contract lifecycle, resident move workflows, and all lease-attached operational artifacts.

## What This Module Really Owns

- Contract records stored on the `Lease` table.
- Contract drafting, activation, cancellation, and update logic.
- Two different move models:
  - direct lifecycle execution
  - resident-request plus management-review plus execution
- Unified lease read models:
  - org list
  - resident list
  - lease history
  - unified timeline
- Lease-attached assets and side records:
  - documents
  - additional terms
  - occupants
  - access cards
  - parking stickers

## Important Architectural Note

This module has two overlapping mental models:

- `contracts`
  - legal/commercial authoring and approval workflow
- `leases`
  - runtime tenancy state and operational artifacts

Those are implemented in one module and backed by the same `Lease` table.

There are also two different ways to create an active tenancy:

- direct `POST /org/buildings/:buildingId/leases/move-in`
- draft/activate contract, then approved move-in execution

That is the single most important thing to surface to your lead.

The code supports both paths, but they are not the same abstraction.

## High-Level Subdomain Map

### 1. Contract authoring

- create draft
- update draft or contract metadata
- replace additional terms
- activate
- cancel

### 2. Move workflow

- resident creates move-in or move-out request
- management reviews request
- management executes approved request

### 3. Direct lifecycle execution

- direct move-in creates active occupancy and active lease in one transaction
- direct move-out ends occupancy, ends allocations, returns access items, and ends lease

### 4. Lease read model

- org lease list
- resident lease list
- active lease for unit
- active lease for resident
- history
- merged timeline

### 5. Lease assets

- documents
- occupants
- access cards
- parking stickers

## Data And State Model

### Main status enums

- `LeaseStatus`
  - `DRAFT`
  - `ACTIVE`
  - `ENDED`
  - `CANCELLED`
- `MoveRequestStatus`
  - `PENDING`
  - `APPROVED`
  - `REJECTED`
  - `CANCELLED`
  - `COMPLETED`
- `AccessItemStatus`
  - `ISSUED`
  - `RETURNED`
  - `DEACTIVATED`

### Important tables

- `Lease`
- `LeaseHistory`
- `LeaseActivity`
- `LeaseDocument`
- `LeaseAccessCard`
- `LeaseParkingSticker`
- `LeaseOccupant`
- `LeaseAdditionalTerm`
- `MoveInRequest`
- `MoveOutRequest`
- `Occupancy`
- `ParkingAllocation`

### Snapshot behavior

Contract creation stores snapshot-style legal and presentation fields directly on the lease:

- owner and landlord names
- tenant name/email/phone
- building and property labels
- contract value and legal metadata

That is intentional. The contract record is not a pure live join over current owner, resident, and building data.

### Display-status behavior

The DTO introduces a display-level status that differs from raw DB status:

- `ENDED` displays as `MOVED_OUT`
- `CANCELLED` with `actualMoveOutDate` also displays as `MOVED_OUT`

So user-facing contract state is already slightly interpreted rather than purely raw persistence state.

## Step-By-Step Request Flows

### 1. Create draft contract

Route: `POST /org/buildings/:buildingId/contracts`

1. Controller requires authenticated org scope.
2. `BuildingAccessGuard` plus `@BuildingWriteAccess()` apply.
3. Route requires `contracts.write`.
4. Service verifies building exists in org.
5. Service verifies unit belongs to building.
6. Service verifies resident user exists in org and is active.
7. Contract period is validated so end is after start.
8. Service rejects if the unit already has an active contract.
9. Additional terms are normalized.
10. Lease row is created with:
    - `status = DRAFT`
    - snapshot fields
    - `residentUserId`
    - `occupancyId = null`
11. Additional terms are inserted if present.
12. `LeaseHistory` records `CREATED`.
13. Response returns full contract view.

### 2. List or read contracts

Routes:

- `GET /org/contracts`
- `GET /org/contracts/:contractId`
- `GET /org/residents/:userId/contracts/latest`
- `GET /resident/contracts`
- `GET /resident/contracts/:contractId`
- `GET /resident/contracts/latest`

Main behavior:

- org-side list supports:
  - status filter
  - building filter
  - unit filter
  - resident filter
  - search across ids, unit labels, snapshots, and resident fields
  - cursor pagination by `leaseStartDate`
- resident-side list and get enforce contract ownership through:
  - `residentUserId`
  - or `occupancy.residentUserId`
- resident latest-summary endpoint also derives:
  - `canRequestMoveIn`
  - `canRequestMoveOut`
  - latest move request statuses

### 3. Update contract

Route: `PATCH /org/contracts/:contractId`

1. Route requires `contracts.write`.
2. Service loads existing contract.
3. If the contract is active and has `ijariId`, legal fields are locked.
4. Service validates contract period ordering when dates change.
5. Lease row is updated.
6. A lease change set is computed.
7. If there are actual differences, `LeaseHistory` records `UPDATED`.
8. Response returns refreshed contract.

### 4. Activate contract

Route: `POST /org/contracts/:contractId/activate`

1. Route requires `contracts.write`.
2. Service rejects ended contracts.
3. If already active, it returns current contract idempotently.
4. Otherwise status becomes `ACTIVE`.
5. `LeaseActivity` records `CONTRACT_ACTIVATED`.

Important note:

- activation does not create occupancy
- activation does not complete move-in

So "active contract" and "moved in" are separate states in this model.

### 5. Cancel contract

Route: `POST /org/contracts/:contractId/cancel`

1. Route requires `contracts.write`.
2. Service rejects ended contracts.
3. If an active occupancy exists on the contract, service first calls lifecycle `moveOut(...)`.
4. Pending or approved move requests are mass-cancelled.
5. Contract status becomes `CANCELLED`.
6. `LeaseActivity` records `CONTRACT_CANCELLED`.

Important note:

- cancel can be a pure draft/active contract cancellation
- or an operational move-out plus cancellation if occupancy already exists

### 6. Replace additional terms

Route: `PUT /org/contracts/:contractId/additional-terms`

1. Route requires `contracts.write`.
2. Service validates contract existence.
3. Terms are normalized.
4. Existing additional terms are deleted.
5. New terms are inserted from scratch.

This is replace semantics, not patch semantics.

### 7. Direct move-in

Route: `POST /org/buildings/:buildingId/leases/move-in`

1. Route requires building write access plus `leases.move_in`.
2. Service verifies building and unit.
3. Unit row is locked with `FOR UPDATE`.
4. Resident user is resolved:
   - existing resident user if `residentUserId` is provided
   - or newly created org user if resident identity payload is provided
5. Service rejects:
   - active occupancy already on unit
   - active occupancy already for resident
6. Active occupancy is created with `startAt = leaseStartDate`.
7. Active lease is created with `occupancyId` set immediately.
8. `LeaseHistory` records `CREATED`.
9. `LeaseActivity` records `MOVE_IN`.
10. Optional resident profile, occupants, parking allocations, vehicles, access cards, parking stickers, and documents are created in the same transaction.

This path is an operational shortcut. It bypasses draft contract and move-request review.

### 8. Direct move-out

Route: `POST /org/buildings/:buildingId/leases/:leaseId/move-out`

1. Route requires building write access plus `leases.move_out`.
2. Service verifies building and lease.
3. Lease must be active and have an active occupancy.
4. By default, all issued access cards and parking stickers are marked returned.
5. Active parking allocations for the occupancy are ended.
6. Occupancy becomes `ENDED`.
7. Lease becomes `ENDED`.
8. Move-out inspection and financial settlement fields are stored on the lease.
9. `LeaseHistory` records `MOVED_OUT`.
10. `LeaseActivity` records `MOVE_OUT`.

### 9. Resident move requests

Routes:

- `POST /resident/contracts/:contractId/move-in-requests`
- `POST /resident/contracts/:contractId/move-out-requests`
- `GET /resident/contracts/:contractId/move-in-requests`
- `GET /resident/contracts/:contractId/move-out-requests`

Move-in request rules:

- contract must belong to resident
- contract must be active
- contract must not already have occupancy
- no open move-in request may already exist

Move-out request rules:

- contract must belong to resident
- contract must be active
- active occupancy must already exist
- no open move-out request may already exist

Both request types:

- create request row with `PENDING`
- write a matching `LeaseActivity`
- notify management through notifications service

### 10. Management review and execution

Routes:

- `GET /org/buildings/:buildingId/move-in-requests`
- `GET /org/buildings/:buildingId/move-out-requests`
- `GET /org/move-requests/inbox-count`
- `POST /org/move-in-requests/:requestId/approve`
- `POST /org/move-in-requests/:requestId/reject`
- `POST /org/move-out-requests/:requestId/approve`
- `POST /org/move-out-requests/:requestId/reject`
- `POST /org/contracts/:contractId/move-in/execute`
- `POST /org/contracts/:contractId/move-out/execute`

Review rules:

- listing is building-scoped
- approval/rejection uses explicit review permission plus assigned move-management access checks
- only pending requests can be approved or rejected

Execution rules:

- approved move-in execution creates occupancy, links it to contract, and completes the request
- approved move-out execution calls lifecycle `moveOut(...)`, completes the request, and may cancel the contract if move-out happened before lease end

### 11. Lease read model

Routes:

- `GET /org/leases`
- `GET /org/buildings/:buildingId/units/:unitId/lease/active`
- `GET /org/leases/:leaseId`
- `GET /org/residents/:userId/leases`
- `GET /org/residents/:userId/leases/timeline`
- `GET /org/leases/:leaseId/history`
- `GET /org/leases/:leaseId/timeline`
- `PATCH /org/leases/:leaseId`
- `GET /resident/lease/active`
- `GET /resident/lease/active/documents`

Key behaviors:

- org list supports filters and cursor pagination
- resident list supports status filter and cursor pagination
- history is only `LeaseHistory`
- timeline merges `LeaseHistory` and `LeaseActivity`
- resident timeline is history-only across the resident's leases
- updateLease changes operational lease fields and records history when values changed

### 12. Lease assets

Documents:

- org-side:
  - list
  - create
  - delete
- resident-side:
  - pre-signed upload URL for signed tenancy contract only
  - create document record for that uploaded object
  - active resident document list

Access cards and parking stickers:

- lease-scoped list/create/update/delete
- duplicate numbers are rejected per lease
- allowed status transitions are limited
- activities are recorded

Occupants:

- full replace operation only
- names are trimmed and deduped
- activity is recorded

## Access Model

### Compatibility layer

There is an explicit permission alias layer between `contracts.*` and `leases.*`.

Examples:

- `contracts.read` aliases `leases.read`
- `leases.read` aliases `contracts.read`
- `contracts.move_requests.review` aliases both move permissions

That means this module still carries naming compatibility baggage.

### Building-scoped vs org-scoped

- contract draft creation is building-scoped
- move request listing is building-scoped
- many lease reads are org-scoped by lease id
- direct lifecycle routes are building-scoped
- resident routes are resident-owned

### Important implication

The permission story is not just one namespace with one scope model.

It is:

- old/new permission aliasing
- org routes
- building routes
- resident routes
- assignment-aware review logic

## Edge Cases And Important Scenarios

### 1. Active contract does not mean moved in

- `LeaseStatus.ACTIVE` can exist without occupancy.
- That is intentional in the contract path.
- Reviewers should not assume active contract implies resident presence.

### 2. Two separate move-in paths can drift

- direct lifecycle `moveIn(...)`
- contract request plus approve plus execute

Both eventually create occupancy and active lease state, but they do not share the same orchestration path.

### 3. Cancellation semantics depend on occupancy state

- cancelling a draft is one thing
- cancelling an active, occupied contract triggers move-out side effects first

This is powerful, but it means cancel is not a simple status change.

### 4. Early move-out becomes cancellation in contract display terms

- approved move-out execution may set contract status to `CANCELLED` when it ends early
- DTO display status can still map it to `MOVED_OUT`

This is reasonable for UI, but it adds interpretive logic that needs to stay consistent.

### 5. Active Ejari-linked contracts lock legal fields

- once active and linked with `ijariId`, many contract fields become immutable
- updates must go through amendment or renewal style flow, which is not fully modeled here

### 6. Replace semantics can erase collections

- additional terms replace
- occupants replace

These APIs are easy to consume, but they are destructive by design.

### 7. Resident ownership is derived from either lease resident or occupancy resident

- resident contract access checks accept:
  - `residentUserId`
  - or `occupancy.residentUserId`

That is practical, but it means ownership logic is slightly indirect.

### 8. Document URLs may be storage-backed indirections

- stored `url` can be `storage://...`
- read APIs resolve those into signed URLs at response time

This is good operationally, but it means returned document URLs are not stable identifiers.

### 9. Access item status transitions are intentionally strict

- `ISSUED -> RETURNED`
- `ISSUED -> DEACTIVATED`
- `RETURNED -> DEACTIVATED`
- no re-issue from `DEACTIVATED`

That is a policy decision worth confirming with operations.

### 10. Move-out updates many surfaces at once

- occupancy
- lease
- parking allocations
- access items
- history
- activities

This is a high-risk path for regression because one operation coordinates multiple domains.

## Cross-Module Dependencies

### Occupancies

- contract execution and lifecycle both create or end occupancy rows
- contract state and resident presence are therefore linked but not identical

### Parking

- move-in may allocate slots and create vehicles
- move-out ends parking allocations

### Residents

- move-in can create or resolve resident users
- move-in can upsert resident profile data
- resident contract views depend on resident ownership logic

### Notifications

- resident move request creation notifies management

### Access control and building access

- move request inbox and review paths depend on assignment-aware access checks in addition to permissions

## Strengths

- Very strong audit posture compared with many other modules:
  - `LeaseHistory`
  - `LeaseActivity`
  - merged timeline
- Contract snapshots preserve legal/business context even if related records later change.
- Resident-facing and org-facing surfaces are both covered.
- Direct lifecycle execution is transactional and includes downstream side effects.
- Lease asset submodules are consistent in pattern and activity logging.
- Tests cover RBAC, lifecycle, documents, access items, and occupant behavior.

## Risks And Design Weaknesses

### 1. Two parallel lifecycle models increase complexity

- direct move-in/move-out path
- contract-request/review/execute path

They solve related problems but make the module harder to reason about and document.

### 2. Contract and lease concepts are still partially collapsed

- legal contract authoring
- occupancy-linked tenancy state
- operational move workflow

All are backed by the same core entity and module.

### 3. Permission aliasing hides the real access model

- `contracts.*` and `leases.*` alias each other
- that helps compatibility
- but it also makes permissions harder to audit and explain cleanly

### 4. Activation and move-in are separate but easy to confuse

- `activateContract(...)` only changes contract status
- `executeApprovedMoveIn(...)` or direct `moveIn(...)` changes resident presence

This is correct, but it is easy for API consumers and reviewers to misunderstand.

### 5. Direct lifecycle and workflow execution do not share one domain service path

- direct `moveIn(...)` creates lease and occupancy together
- request execution path creates occupancy against an existing active contract

If product rules evolve, drift between these two paths is a real risk.

### 6. Lease assets are attached to lease, not occupancy

- access cards
- parking stickers
- occupants
- documents

That is mostly fine, but operational reasoning sometimes follows active occupancy rather than lease record. This can create edge cases around renewals, early cancellations, and historical carryover.

### 7. Some write APIs are collection-replace or bulk side-effect operations

- replace additional terms
- replace occupants
- cancel contract
- move-out

These are efficient, but they are high-impact operations with few granular safeguards.

## Improvement Opportunities

### High priority

- Publish an explicit state machine covering:
  - draft
  - active contract without occupancy
  - active occupied contract
  - moved out
  - cancelled
- Decide whether the direct lifecycle path and the review-based path should remain separate long term.
- Clarify the canonical boundary between "contract" and "lease" in internal docs and API naming.

### Medium priority

- Consider consolidating move execution rules behind a more obviously shared domain service.
- Review whether permission aliasing should remain permanent or be migrated toward one canonical namespace.
- Add more explicit guardrails or dry-run insight for destructive collection-replace operations.
- Review whether resident-facing request actions should be modeled as a distinct move-workflow submodule.

### Lower priority

- Consider renewal and amendment as first-class workflows if legal contract management will deepen.
- Add more explicit asset carry-forward rules for renewals or replacement contracts.

## Concrete Review Questions For Your Lead

1. Do you want to keep both the direct move-in/move-out path and the reviewed contract-request path?
2. Is `Lease` intended to remain both the contract record and the runtime tenancy record?
3. Should permission aliasing between `contracts.*` and `leases.*` stay for compatibility, or should one namespace win?
4. Is activation-without-occupancy a stable product requirement, or a temporary modeling compromise?
5. Do collection-replace APIs for occupants and additional terms need stronger guardrails or versioning?

## Testing Signals

### Main coverage already present

- `test/contracts-controller-rbac.e2e.spec.ts`
- `test/leases.e2e.spec.ts`
- `test/leases-move.e2e.spec.ts`
- `test/lease-documents.e2e.spec.ts`
- `test/lease-access-items.e2e.spec.ts`
- `test/lease-occupants.e2e.spec.ts`
- service specs for contracts, leases, and documents

### Notable cases already tested

- building-assigned vs org-wide contract permissions
- owner identity kept as snapshot fields on contracts
- direct move-in and move-out
- conflict prevention for occupied unit and existing occupancy
- no partial records on move-in conflict
- lease history after updates
- merged lease timeline behavior and filters
- org lease list filters and cursor pagination
- resident lease list and resident lease timeline
- document CRUD with org isolation
- resident document upload restrictions
- duplicate access-card and parking-sticker prevention
- access-item cross-lease protection
- occupant replacement and cleanup behavior

## Suggested Follow-On Docs

- A lease state machine diagram with both direct lifecycle and review-based workflow paths.
- A small permission map showing `contracts.*`, `leases.*`, and resident lease permissions side by side.
