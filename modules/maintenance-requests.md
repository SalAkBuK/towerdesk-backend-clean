# Maintenance Requests Review

## Scope

- Source: `src/modules/maintenance-requests`
- Main files:
  - `maintenance-requests.service.ts`
  - `maintenance-requests.repo.ts`
  - `maintenance-request-policy.ts`
  - `maintenance-request-estimate-monitor.service.ts`
  - `resident-requests.controller.ts`
  - `building-requests.controller.ts`
  - `provider-requests.controller.ts`
  - DTOs under `src/modules/maintenance-requests/dto`
- Public routes:
  - Resident: `/resident/requests/*`
  - Building operations: `/org/buildings/:buildingId/requests/*`
  - Provider portal: `/provider/requests/*`
- Core responsibility: intake, triage, assignment, estimates, approvals, comments, attachments, and request policy routing.

## What This Module Really Owns

- The full request lifecycle and state transitions.
- Role-specific views for resident, building staff/admin, and providers.
- Owner approval workflow and audit trail for approval decisions.
- Request policy routing and queue classification.
- Requester and tenancy context enrichment for downstream reporting and decisions.
- Comment and attachment handling with per-scope read tracking.

## Important Architectural Notes

- Building routes use `JwtAuthGuard`, `OrgScopeGuard`, `BuildingAccessGuard`, and permission checks.
- Resident routes use `JwtAuthGuard`, `OrgScopeGuard`, and `PermissionsGuard`.
- Provider routes use `JwtAuthGuard` and provider membership checks in the service.
- Owner approvals and overrides use audit records and event emissions for notifications.
- Policy routing uses a mix of explicit flags and keyword heuristics.
- Requester/tenancy context enrichment is part of the core view model, not an optional addon.

## Step-By-Step Request Flows

### 1. Resident intake (create request)

1. `POST /resident/requests` requires `resident.requests.create`.
2. Service asserts org scope and active resident occupancy.
3. Attachments are prepared but only stored via request creation.
4. Emergency flags are normalized and inferred from `emergencySignals`.
5. Request is created with:
   - `status = OPEN`
   - `isEmergency` computed from signals or flag
   - `occupancyAtCreation` and optional `leaseAtCreation`
6. Emits `maintenance.request.created`.

### 2. Resident update and cancel

1. `PATCH /resident/requests/:requestId` allows updates only while `OPEN`.
2. Updates are rejected if no changes are provided.
3. Emergency flag is recomputed when emergency fields change.
4. `POST /resident/requests/:requestId/cancel` forbids cancel if `COMPLETED` or `CANCELED`.
5. Cancel emits `maintenance.request.canceled`.

### 3. Resident comments

1. Resident comments are always `SHARED`.
2. Comments are blocked when the request is closed.
3. Comment emits `maintenance.request.commented`.

### 4. Building operations list and detail

1. `GET /org/buildings/:buildingId/requests` requires `requests.read`.
2. Staff-only users (building assignment without `requests.assign`) only see assigned requests.
3. Optional query filters:
   - `status`
   - `ownerApprovalStatus`
   - `queue` (computed via policy routing)
4. Requests are enriched with requester and tenancy context.
5. `GET /org/buildings/:buildingId/requests/:requestId` applies the same staff-only restriction.

### 5. Assign to staff

1. `POST /org/buildings/:buildingId/requests/:requestId/assign` requires `requests.assign`.
2. Request must be `OPEN` or `ASSIGNED`.
3. Request must not be blocked by owner approval or estimate.
4. Target user must:
   - be active
   - belong to org
   - have building-scoped assignment with request handling permissions
5. Assignment clears provider assignment and sets status to `ASSIGNED`.
6. Emits `maintenance.request.assigned`.

### 6. Assign to provider and request estimate

1. `assign-provider` and `request-estimate` require `requests.assign`.
2. Provider must be active and linked to the building.
3. For `request-estimate`:
   - request must be in `NEEDS_ESTIMATE` route (or `REJECTED` approval)
   - owner approval must not be pending
   - estimate status is set to `REQUESTED` and due date is set
   - request status resets to `OPEN`
4. Both paths clear staff assignment, assign provider, and emit `maintenance.request.assigned`.

### 7. Provider worker assignment and unassignment

1. `assign-provider-worker` (building-side):
   - requires `requests.assign`
   - request must be assigned to an active provider
   - worker must be active provider member
2. `assign-worker` (provider-side):
   - provider managers can assign any member
   - request must be `OPEN` or `ASSIGNED`
3. `unassign-provider` clears provider assignment and worker assignment.
4. If estimate was requested, unassigning also resets estimate fields.

### 8. Status transitions

1. `POST /.../status` allows only:
   - `OPEN -> ASSIGNED -> IN_PROGRESS -> COMPLETED`
2. Staff-only can update status only if assigned.
3. Status updates are blocked when owner approval or estimate is pending.
4. Emits `maintenance.request.status_changed`.

### 9. Owner approval flow

1. `owner-approval/require` sets `PENDING` and records `approvalRequiredReason`.
2. `owner-approval/request-now` sets `PENDING`, records required reason, and records request timestamp.
3. `owner-approval/request` only allowed when status is `PENDING` and no prior request timestamp exists.
4. `owner-approval/resend` requires prior request timestamp.
5. Each action writes audit records and emits owner-approval events.
6. Overrides:
   - `MANAGEMENT_OVERRIDE` requires deadline expiry.
   - `EMERGENCY_OVERRIDE` does not require deadline.
   - Override transitions to `APPROVED` and is audited.

### 10. Policy triage and estimates

1. `policy-triage` updates estimate and policy flags without starting approvals.
2. `estimate` (building-side) and provider-side estimate submission:
   - updates estimate data
   - route is recalculated
   - if route demands owner approval, `PENDING` is set and request is auto-requested
3. Owner approval and estimate states gate execution via `assertExecutionUnlocked`.

### 11. Comments and unread counts

1. Building comments allow `SHARED` and `INTERNAL`.
2. Provider comments are always `SHARED`.
3. Resident comments are always `SHARED`.
4. Read state is tracked per scope (`BUILDING`, `PROVIDER`).
5. Unread counts only count comments after the user’s last read time.

### 12. Attachments

1. Residents can attach on creation only.
2. Building and provider users can append attachments while the request is open.
3. Attachments are stored with `uploadedByUserId` for audit.

## Request Policy And Queue Logic

### Route computation

- Emergency signals or emergency keywords push to `EMERGENCY_DISPATCH`.
- Upgrade, major replacement, responsibility dispute, non-like-for-like, or estimated amount > 1000 => `OWNER_APPROVAL_REQUIRED`.
- `estimateStatus = REQUESTED` => `NEEDS_ESTIMATE`.
- Minor keywords or like-for-like => `DIRECT_ASSIGN`.
- Otherwise defaults to `NEEDS_ESTIMATE`.

### Queues

- `NEW`: open + no approval requirement + not direct/urgent.
- `NEEDS_ESTIMATE`: open + estimate not requested.
- `AWAITING_ESTIMATE`: estimate requested.
- `AWAITING_OWNER`: owner approval pending.
- `READY_TO_ASSIGN`: open + direct/urgent routes with no blocking approval.
- `ASSIGNED`, `IN_PROGRESS` map directly to status.
- `OVERDUE` is computed from age (`MAINTENANCE_REQUEST_OVERDUE_HOURS`).

## Read Models And Response Shapes

### Resident response

- Minimal view with unit, assignment, attachments, and status.
- No policy or approval details.

### Building response

- Full view including:
  - requester context
  - tenancy context
  - owner approval details
  - estimate workflow
  - policy recommendation and queue

### Provider response

- Provider-specific view with building name.
- Includes owner approval and estimate workflow data.

### Comment response

- Includes author type, visibility, and owner ID if applicable.

## Validation And Defaults

- Resident create requires title (min length 3).
- Status updates only allow `IN_PROGRESS` or `COMPLETED`.
- Assignment and provider actions require valid UUIDs.
- Policy updates require at least one triage field.
- Emergency signals are normalized and de-duplicated.

## Data And State Model

### Core tables touched directly

- `MaintenanceRequest`
- `MaintenanceRequestAttachment`
- `MaintenanceRequestComment`
- `MaintenanceRequestCommentReadState`
- `MaintenanceRequestOwnerApprovalAudit`
- `Occupancy`, `Lease` (tenancy inference)
- `ServiceProvider`, `ServiceProviderBuilding`, `ServiceProviderUser`

### External/domain side effects

- Emits events for created, assigned, status changes, comments, approvals, overrides, and estimate reminders.
- Scheduled estimate reminders via `MaintenanceRequestEstimateMonitorService`.

## Edge Cases And Important Scenarios

- Staff-only building users only see assigned requests and can only act on those.
- Cross-org request access returns 404 even if the request exists.
- Owner approval pending or rejected blocks assignment and status changes.
- Estimate requested blocks execution until submission.
- Provider worker can only write once assigned or as provider manager.
- Shared vs internal comments affect visibility and unread counts.
- Owner approval override requires deadline expiry for management override.
- Tenancy context can be inferred when snapshot fields are missing.

## Strengths

- Comprehensive workflow coverage with strong guardrails.
- Clear separation of resident, building, and provider responsibilities.
- Explicit policy routing logic instead of ad-hoc branching.
- Good auditability of owner approval lifecycle.

## Risks And Design Weaknesses

### 1. Service complexity is high

- Many flows live in a single service, increasing maintenance overhead.

### 2. Policy routing is heuristic-heavy

- Keyword-based routing can be brittle without explicit rule ownership.

### 3. Request list filtering is in-memory

- Queue filtering happens after list query, which could be heavy at scale.

### 4. Approval blocking uses multiple checks

- Status/route checks exist in multiple paths; easy to drift.

## Improvement Opportunities

### High priority

- Add pagination and filtering to building and provider list endpoints.
- Centralize execution gating logic to reduce drift.
- Split policy and approval logic into smaller internal modules.

### Medium priority

- Externalize policy routing rules into config or an admin-managed policy table.
- Add bulk reporting endpoints for SLA and overdue items.
- Add explicit contract tests around event payloads.

### Lower priority

- Add background processing for attachments and heavy side effects.
- Provide a clear policy-rule audit trail for compliance and support.

## Concrete Review Questions For Your Lead

1. Should policy routing rules remain code-based or move to configuration?
2. Do we need pagination before request volume scales?
3. Are we comfortable with queue filtering being in-memory?
4. Should owner approval overrides require additional audit metadata?
5. Do we want to consolidate resident/provider comment read state logic?

## Testing Signals

### Integration coverage already present

- `test/maintenance-requests.e2e.spec.ts`
- `test/owner-request-approvals.e2e.spec.ts`

### Notable cases already tested

- resident create, update, cancel, and read flows
- staff-only assignment visibility rules
- emergency vs minor vs unclear policy routing
- provider assignment, worker assignment, and unassignment
- estimate requested and submission gates
- owner approval lifecycle and overrides
- comment visibility and unread counts
