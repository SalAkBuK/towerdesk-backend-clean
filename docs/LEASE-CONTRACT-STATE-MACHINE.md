# Lease / Contract State Machine

This document explains the lease module as a state machine instead of as a list of endpoints.

It is based on:

- `modules/leases.md`
- `modules/occupancies.md`
- the state and risk notes already summarized in `docs/BACKEND-CAPABILITIES-V2.md`

## 1. Why This Needs Its Own Document

The lease module is not only "leases."

It currently carries:

- legal contract authoring
- operational move-in and move-out execution
- resident move-request workflow
- lease history and activity
- lease-scoped artifacts such as documents, occupants, access cards, and parking stickers

That is why teams keep confusing:

- active contract
- active occupancy
- moved-in resident
- ended lease
- cancelled contract

They are related, but they are not the same state.

## 2. Core State Dimensions

There is no single perfect state enum for the whole subdomain. The system really has multiple dimensions.

### A. Raw lease status

- `DRAFT`
- `ACTIVE`
- `ENDED`
- `CANCELLED`

### B. Occupancy linkage

- no occupancy linked
- active occupancy linked
- ended occupancy linked

### C. Move-request state

- `PENDING`
- `APPROVED`
- `REJECTED`
- `CANCELLED`
- `COMPLETED`

### D. Access-item state

- `ISSUED`
- `RETURNED`
- `DEACTIVATED`

### E. Display status

The UI-facing status is already partially interpreted:

- raw `ENDED` displays as `MOVED_OUT`
- raw `CANCELLED` with `actualMoveOutDate` can also display as `MOVED_OUT`

So raw persistence state and user-facing status are already not the same thing.

## 3. Canonical Composite States

These are the practical states people usually mean when they talk about leases/contracts.

### 1. Draft contract

- raw lease status: `DRAFT`
- occupancy: none
- resident is not moved in
- created by `POST /org/buildings/:buildingId/contracts`

### 2. Active contract, not moved in

- raw lease status: `ACTIVE`
- occupancy: none
- resident is still not moved in
- reached by `POST /org/contracts/:contractId/activate`

This is the most important non-obvious state in the whole module.

### 3. Active occupied contract

- raw lease status: `ACTIVE`
- occupancy: active
- resident is moved in
- reached by:
  - direct move-in
  - approved move-in execution against an active contract

### 4. Ended moved-out lease

- raw lease status: `ENDED`
- occupancy: ended
- resident is moved out
- usually reached by normal move-out lifecycle

### 5. Cancelled contract without occupancy

- raw lease status: `CANCELLED`
- occupancy: none
- resident never moved in, or contract was cancelled before occupancy existed

### 6. Cancelled after operational move-out

- raw lease status: `CANCELLED`
- occupancy: ended
- usually occurs when a move-out happens early enough that the contract is treated as cancelled rather than normally ended
- display layer may still show `MOVED_OUT`

## 4. State Transitions

## A. Contract authoring path

| From | Action | To | Important side effects |
| --- | --- | --- | --- |
| none | create draft contract | draft contract | snapshot fields stored, additional terms inserted, `LeaseHistory.CREATED` |
| draft contract | update contract | draft contract | history records `UPDATED` when real change exists |
| draft contract | activate contract | active contract, not moved in | `LeaseActivity.CONTRACT_ACTIVATED`; no occupancy created |
| draft contract | cancel contract | cancelled contract without occupancy | pending/approved move requests cancelled |
| active contract, not moved in | cancel contract | cancelled contract without occupancy | pending/approved move requests cancelled |

## B. Direct lifecycle path

| From | Action | To | Important side effects |
| --- | --- | --- | --- |
| no occupancy on unit, no active occupancy for resident | direct move-in | active occupied contract | unit locked, occupancy created, lease created with occupancy attached, history/activity written, optional resident profile/occupants/parking/vehicles/access-items/docs can be created in same transaction |
| active occupied contract | direct move-out | ended moved-out lease | occupancy ended, lease ended, parking allocations ended, access items returned by default, settlement/inspection fields stored, history/activity written |

This path is the operational shortcut. It bypasses draft-contract review and move-request review.

## C. Reviewed move-request path

| From | Action | To | Important side effects |
| --- | --- | --- | --- |
| active contract, not moved in | resident creates move-in request | active contract, not moved in + move-in request `PENDING` | request activity logged, management notified |
| active occupied contract | resident creates move-out request | active occupied contract + move-out request `PENDING` | request activity logged, management notified |
| request `PENDING` | management approves | request `APPROVED` | review permission and move-management access required |
| request `PENDING` | management rejects | request `REJECTED` | same review gating |
| move-in request `APPROVED` | execute move-in | active occupied contract + request `COMPLETED` | occupancy created and linked to existing contract |
| move-out request `APPROVED` | execute move-out | ended or cancelled moved-out contract + request `COMPLETED` | lifecycle `moveOut(...)` runs; early move-out may cancel contract instead of ending it |

## D. Cancellation path with occupancy

| From | Action | To | Important side effects |
| --- | --- | --- | --- |
| active occupied contract | cancel contract | cancelled after operational move-out | service first calls lifecycle move-out, then mass-cancels pending/approved move requests, then marks contract `CANCELLED` |

This is why "cancel contract" is not just a status flip.

## 5. Request-State Rules

### Move-in request preconditions

- contract must belong to resident
- contract must be active
- contract must not already have occupancy
- no open move-in request may already exist

### Move-out request preconditions

- contract must belong to resident
- contract must be active
- active occupancy must already exist
- no open move-out request may already exist

### Review rules

- request listing is building-scoped
- approve/reject requires explicit review permission and move-management access
- only `PENDING` requests can be approved or rejected

### Execution rules

- approved move-in execution creates occupancy and links it to the contract
- approved move-out execution runs the lifecycle move-out path
- request completion is separate from request approval

## 6. Access-Item State Rules

The lease review explicitly calls out strict transitions:

- `ISSUED -> RETURNED`
- `ISSUED -> DEACTIVATED`
- `RETURNED -> DEACTIVATED`

No re-issue path from `DEACTIVATED` is documented in the review set.

## 7. High-Risk Invariants

- active contract does not imply moved in
- one resident cannot be directly moved into a second active occupancy
- one unit cannot receive a second active occupancy
- resident contract ownership can be derived by either `residentUserId` or `occupancy.residentUserId`
- active `ijariId`-linked contracts lock important legal fields
- collection-replace endpoints are destructive by design:
  - additional terms replace
  - occupants replace

## 8. Side Effects By Transition

### Create draft

- writes snapshot fields into `Lease`
- writes `LeaseHistory.CREATED`

### Activate contract

- changes `Lease.status`
- writes `LeaseActivity.CONTRACT_ACTIVATED`
- does not create occupancy

### Direct move-in

- creates occupancy
- creates active lease
- writes history and activity
- may create or upsert resident identity/profile details
- may create occupants
- may create parking allocations and vehicles
- may create access cards and parking stickers
- may create lease documents

### Direct move-out

- ends occupancy
- ends lease
- ends active parking allocations
- returns issued access cards/stickers by default
- stores settlement and inspection details
- writes history and activity

### Cancel occupied contract

- can trigger move-out side effects first
- then marks contract cancelled

## 9. Confusing Points That Need To Stay Explicit

### Activation is not move-in

`POST /org/contracts/:contractId/activate` changes contract state only.

### Contract and lease are not cleanly separated

The current module/table is carrying both legal and operational concepts.

### There are two move-in paths

- direct lifecycle path
- request/approve/execute path

If business rules change, drift between them is a real risk.

### Display status is interpreted

Users can see `MOVED_OUT` even when raw DB state is `ENDED` or `CANCELLED` with `actualMoveOutDate`.

## 10. Recommended Hardening Moves

- publish one canonical lifecycle diagram for direct and reviewed paths together
- decide whether direct move-in/move-out and reviewed move execution should remain separate long term
- reduce permission alias confusion between `contracts.*` and `leases.*`
- add stronger guardrails for replace-style writes
- keep frontend language strict about:
  - contract active
  - moved in
  - moved out
  - cancelled
