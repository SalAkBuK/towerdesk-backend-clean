# Visitors Review

## Scope

- Source: `src/modules/visitors`
- Main files:
  - `visitors.controller.ts`
  - `resident-visitors.controller.ts`
  - `visitors.service.ts`
  - `visitors.repo.ts`
  - DTOs under `src/modules/visitors/dto`
- Public routes:
  - Org: `POST|GET|PATCH /org/buildings/:buildingId/visitors`
  - Resident: `POST|GET|PATCH /resident/visitors`
  - Resident detail: `GET /resident/visitors/:visitorId`
  - Resident cancel: `POST /resident/visitors/:visitorId/cancel`
- Core responsibility: register and track visitors from both management and resident entry points.

## What This Module Really Owns

- Visitor creation and lifecycle updates.
- Resident-specific visitor entry rules.
- Visitor visibility rules for residents and roommates.
- Visitor arrival notifications to residents.

## Important Architectural Notes

- Org routes use building guards and `visitors.*` permissions.
- Resident routes are org-scoped and depend on active occupancy.
- Resident visitor updates are more restricted than org updates.
- Visitor arrival triggers a notification for unit residents.

## Step-By-Step Request Flows

### 1. Org create visitor

1. `POST /org/buildings/:buildingId/visitors` requires `visitors.create`.
2. Building must belong to org.
3. Unit must belong to building.
4. Visitor is created with `EXPECTED` status by default.

### 2. Org list visitors

1. `GET /org/buildings/:buildingId/visitors` requires `visitors.read`.
2. Optional filters:
   - `status`
   - `unitId`
3. Unit filter is validated to belong to building.

### 3. Org update visitor

1. `PATCH /org/buildings/:buildingId/visitors/:visitorId` requires `visitors.update`.
2. Visitor must belong to building.
3. Unit changes are validated to belong to building.
4. Status changes are allowed on org path.
5. When status transitions to `ARRIVED`, a resident notification is sent.

### 4. Resident create visitor

1. `POST /resident/visitors` requires `resident.visitors.create`.
2. Resident must have exactly one active occupancy.
3. Building and unit are derived from occupancy, not request input.
4. Visitor is created with `EXPECTED` status.

### 5. Resident list and detail

1. `GET /resident/visitors` requires `resident.visitors.read`.
2. Uses active occupancy unit to list visitors.
3. Roommates in the same unit see the same visitor list.
4. `GET /resident/visitors/:visitorId` only returns visitors in that unit.

### 6. Resident update and cancel

1. `PATCH /resident/visitors/:visitorId` requires `resident.visitors.update`.
2. Resident cannot change status.
3. `POST /resident/visitors/:visitorId/cancel`:
   - only allowed when status is `EXPECTED`
   - updates status to `CANCELLED`

## Read Models And Response Shapes

### Visitor response

- Includes:
  - `type`, `status`, visitor identity fields
  - unit id/label
  - current tenant name (if any)

## Validation And Defaults

- Visitor `type`, `visitorName`, and `phoneNumber` are required.
- `expectedArrivalAt` must be ISO 8601 if provided.
- Resident create/update does not accept `unitId`.
- Resident update does not accept `status`.

## Data And State Model

### Core tables touched directly

- `Visitor`
- `Unit`
- `Occupancy`
- `User`

### External/domain side effects

- Emits `VISITOR_ARRIVED` notifications to current unit residents.

## Edge Cases And Important Scenarios

- Residents without active occupancy receive `409`.
- Residents with multiple active occupancies are blocked.
- Roommates share visitor visibility.
- Resident cannot promote a visitor to arrived/completed.
- Org updates can change status and trigger arrival notification.

## Strengths

- Clean split between org and resident responsibilities.
- Strict occupancy-based scoping for residents.
- Immediate resident notification on arrival.

## Risks And Design Weaknesses

### 1. State model is minimal

- No explicit audit trail of status transitions or arrivals.

### 2. Multiple active occupancies are blocked

- This is safe but may require more nuanced handling in future.

## Improvement Opportunities

### High priority

- Add explicit visitor state-transition rules and audit metadata.
- Add confirmation/verification for arrival events if required by security staff.

### Medium priority

- Add notifications for upcoming expected arrivals.
- Add visit expiration or auto-cancel policies.

### Lower priority

- Add QR pass or access code generation.
- Add retention/masking policy for visitor PII.

## Concrete Review Questions For Your Lead

1. Do we need a richer visitor status model or audit log?
2. Should residents be allowed to mark arrivals in any case?
3. Should visitor records expire automatically after a time window?
4. Do we need a PII retention policy on visitor identity fields?

## Testing Signals

### Integration coverage already present

- `test/visitors.e2e.spec.ts`

### Notable cases already tested

- resident occupancy derivation and roommate visibility
- resident update restrictions and cancel behavior
- org create/list/update flows
