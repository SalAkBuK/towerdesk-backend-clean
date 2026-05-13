# Unit Ownerships Review

## Scope

- Source: `src/modules/unit-ownerships`
- Main files:
  - `unit-ownership.service.ts`
  - `unit-ownerships.module.ts`
- Public HTTP routes: none directly.
- Used by: owner and owner-portfolio workflows, unit updates.
- Core responsibility: keep ownership history and active-owner invariants for units during and after the ownership-model migration.

## What This Module Really Owns

- Active ownership tracking for a unit.
- Ownership history via append-only rows with `startDate` and `endDate`.
- Dual-write logic that keeps `Unit.ownerId` and `UnitOwnership` aligned.
- Migration seam behavior (fallback to `Unit.ownerId` when history is missing).

## Step-By-Step Request Flows

### 1. Sync current owner (primary API)

1. Caller provides:
   - `orgId`
   - `unitId`
   - `ownerId` (nullable)
   - optional transaction client
2. Service loads active ownership rows for the unit (`endDate = null`).
3. If `ownerId` is empty/null:
   - any active rows are ended (`endDate = now`).
   - no new row is created.
4. If `ownerId` is provided:
   - if a single active row already matches `ownerId`, do nothing.
   - otherwise:
     - end any active rows for other owners
     - create a new active row with `startDate = now`, `endDate = null`, `isPrimary = true`.
5. If a transaction client is supplied, all reads/writes occur on that client for consistency with the parent flow.

## Validation And Defaults

- No explicit DTO validation here; callers must ensure `orgId`, `unitId`, and `ownerId` are valid.
- Active ownership is defined by `endDate = null`.
- When owner is removed, all active rows are closed.

## Data And State Model

### Core table touched

- `UnitOwnership`

### Invariants enforced by code and migration

- At most one active ownership row per unit.
- Ownership history is preserved by closing old rows rather than overwriting.
- `Unit.ownerId` acts as a fallback until migration is fully complete.

## Edge Cases And Important Scenarios

### Multiple active rows already exist

- The service ends all active rows that do not match the new `ownerId`.
- This cleans up data if earlier writes or migration glitches created duplicates.

### Owner removed

- Passing `ownerId = null` ends all active rows.
- No new row is created.

### Owner unchanged

- If the single active row already matches `ownerId`, no writes occur.
- This avoids unnecessary churn and preserves history.

### Transaction usage

- When called inside a larger flow (e.g., unit update), a transaction client ensures dual writes stay consistent.

### Migration fallback

- During migration, owner resolution may fall back to `Unit.ownerId` if no active ownership row exists.
- This fallback is explicitly tested, but should be temporary.

## Strengths

- Clear, minimal logic to enforce single-active-owner invariant.
- Safe dual-write pattern when used with a transaction client.
- Tests cover migration backfill and pointer invariant behavior.

## Risks And Design Weaknesses

### 1. Reliance on caller validation

- The service does not validate `orgId`, `unitId`, or `ownerId` existence.
- Incorrect inputs could create orphaned ownership rows if callers are careless.

### 2. Migration fallback could become permanent

- As long as code uses `Unit.ownerId` fallback, inconsistent states can persist.
- This undermines the purpose of the history table.

### 3. No explicit audit trail

- Changes are visible in history rows but there is no “who changed” data.
- Operational reviews may need user attribution.

## Improvement Opportunities

### High priority

- Define a completion plan to remove `Unit.ownerId` fallback reads.
- Add guardrails to ensure only valid org/unit/owner IDs are passed in.

### Medium priority

- Add explicit audit metadata (actor user id) on ownership changes.
- Consider a service method to repair multiple-active-row violations.

### Lower priority

- Expose a read API for ownership history if business users need it.

## Concrete Review Questions For Your Lead

1. When do we plan to remove the fallback to `Unit.ownerId`?
2. Should ownership changes record the actor user for audit?
3. Do we need a periodic integrity job to enforce single active row per unit?
4. Is it acceptable that this service trusts the caller for ID validity?
5. Do we want any admin reporting on ownership history changes?

## Testing Signals

### Unit coverage already present

- `src/modules/unit-ownerships/unit-ownership.service.spec.ts`

### Integration coverage already present

- `test/unit-ownership-migration.e2e.spec.ts`

### Notable cases already tested

- create initial active ownership
- end active ownership when owner removed
- no-op when owner unchanged
- transition between owners and history preservation
- backfill/migration and pointer fallback invariants
