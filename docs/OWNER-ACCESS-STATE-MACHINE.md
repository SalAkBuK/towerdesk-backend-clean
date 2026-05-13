# Owner Access State Machine

This document explains owner identity and owner-access lifecycle as a state machine instead of as isolated CRUD and invite endpoints.

It is based on:

- `modules/owners.md`
- `modules/owner-portfolio.md`
- `modules/parties.md`
- `modules/unit-ownerships.md`

## 1. Why This Needs Its Own Document

The owner domain has three different truths that people tend to collapse into one:

- org-local owner record
- global party identity
- owner access grant

On top of that, runtime owner portal access also depends on current ownership scope.

So "owner exists" does not mean "owner can use the portal."

## 2. Core Entities

### A. Owner

- org-scoped
- mutable within the org
- can carry display/contact overrides

### B. Party

- global identity shared across orgs
- identifier-backed
- reused across owner records in different orgs when safe resolution is performed

### C. OwnerAccessGrant

- runtime access grant for an owner user
- only one active representative per owner
- transitions are audited

## 3. State Dimensions

### A. Owner record state

The module review treats owner activity as a prerequisite in grant flows, so the practical dimensions are:

- active owner record
- inactive owner record

### B. Access-grant state

- `PENDING`
- `ACTIVE`
- `DISABLED`

### C. Ownership scope state

At runtime, owner portal access also depends on owned units being in scope through:

- active `UnitOwnership`
- temporary fallback to `Unit.ownerId` when migration gaps exist

So portal access is really:

- active grant
- active owner
- accessible owned unit scope

## 4. Main Lifecycle Paths

## A. Identity resolution and owner creation

| From | Action | To | Important side effects |
| --- | --- | --- | --- |
| no matching owner in org | resolve-party with strong identifier and token reuse | owner linked to existing party or new party | raw identifiers stay inside `parties`, masked output only |
| same party already exists in org | create/reuse owner | same owner record updated | duplicate owner in same org is avoided through `(orgId, partyId)` reuse |
| no resolution token and no exact identifier match | create owner | new owner + possibly new party | duplicate real-world person can be created across orgs if teams skip the safe flow |

## B. Access-grant lifecycle

| From | Action | To | Important side effects |
| --- | --- | --- | --- |
| active owner, no active representative | invite by email with no matching active user | `PENDING` grant | standalone owner user may be created, invite sent through auth reset flow, audit written |
| active owner, no active representative | invite by email with matching active user | `ACTIVE` grant | verification method `EMAIL_MATCH`, audit written |
| active owner, no active representative | link existing user | `ACTIVE` grant | verification method `ADMIN_LINK`, audit written, notification sent |
| `PENDING` grant | activate pending grant | `ACTIVE` grant | audit written, notification sent |
| `PENDING` grant | resend invite | `PENDING` grant | `invitedAt` updated, audit written, invite resent |
| `PENDING` or `ACTIVE` grant | disable | `DISABLED` grant | audit written, notification sent |

## 5. Hard Preconditions

### Owner access grant creation or activation requires:

- owner must be active
- owner must have no active representative already
- target user must be active if linking or activating

### Safe identity reuse requires:

- resolution token
- or exact strong identifier match

If neither exists, a new party can be created even if the person already exists in another org.

## 6. Runtime Owner Portal Access

The portal is not org-RBAC-based.

Runtime owner access is derived from:

- active `OwnerAccessGrant`
- active owner record
- active owned unit scope

Important migration nuance:

- if no active `UnitOwnership` row exists, owner-portfolio can temporarily fall back to `Unit.ownerId`

This is why portal visibility can still work during migration, but also why the migration seam is risky if left in place too long.

## 7. Key Invariants

- one active representative per owner
- raw identifiers are never returned from party-resolution flow
- masked identifier output is last4-style only
- grant transitions are audited
- same-party presence in another org does not automatically grant runtime access

## 8. Confusing Points That Need To Stay Explicit

### Owner record is not the same as party identity

Updating owner contact fields does not update party identity data.

### Party reuse is not automatic magic

If teams skip `resolve-party`, duplicates are easy.

### Email auto-link can activate immediately

Invite-by-email can create an `ACTIVE` grant immediately if an active matching user already exists.

### Cross-org linking is policy, not accident

Auto-link by email does not enforce `orgId` the way ordinary org-user logic would.

### Portal access depends on grant and ownership scope

An owner can have a grant and still lose practical visibility when ownership or owner activity changes.

## 9. Failure Modes To Watch

- duplicate real-world owner created because resolution-token flow was skipped
- active representative creation blocked because pending/active grant already exists
- support confusion when owner update does not change party identity data
- portal visibility mismatch during ownership migration because fallback `Unit.ownerId` is still involved
- cross-org email auto-link surprises teams who expected stricter org separation

## 10. Recommended Hardening Moves

- publish one canonical owner identity flow:
  - resolve
  - token
  - create or reuse
- decide whether one active representative is still the correct business rule
- make cross-org email-link policy explicit in product and admin docs
- finish the ownership migration so runtime scope no longer depends on `Unit.ownerId` fallback
- expose clearer admin/debug surfaces for:
  - grant status
  - audit trail
  - current ownership scope
