# Owner Portfolio Review

## Scope

- Source: `src/modules/owner-portfolio`
- Main files:
  - `owner-portfolio.controller.ts`
  - `owner-profile.controller.ts`
  - `owner-portfolio-scope.service.ts`
  - `owner-profile.service.ts`
  - DTOs under `src/modules/owner-portfolio/dto`
- Public routes:
  - Owner account/profile: `/owner/*`
  - Owner portfolio and request views: `/owner/portfolio/*`
- Core responsibility: provide the owner-facing runtime view of units, maintenance requests, approvals, and shared comments based on active owner access grants.

## What This Module Really Owns

- The owner portal surface that is not org-RBAC scoped.
- Runtime owner access resolution across owner access grants and current unit ownership.
- Owner account profile updates and org-local owner profile updates.
- Owner approval decisions on maintenance requests.
- Owner-visible maintenance-request comments and unread comment counting.

## Important Architectural Notes

- All routes are guarded by `JwtAuthGuard` and `OwnerPortfolioGuard`.
- This module does not use org RBAC (`OrgScopeGuard` + permissions) because owners are not org users. Scope is grant-based instead.
- Owner visibility is built from `OwnerAccessGrant` + `Owner.isActive` + active `UnitOwnership` rows.
- A fallback exists for migration scenarios: when no active `UnitOwnership` exists, the service temporarily falls back to `Unit.ownerId`.

## Step-By-Step Request Flows

### 1. Resolve owner runtime access

1. `OwnerPortfolioGuard` checks for an active `OwnerAccessGrant` to an active owner.
2. Service loads accessible owner IDs from active grants.
3. Service resolves accessible units from active `UnitOwnership` rows.
4. Migration fallback reads `Unit.ownerId` for units without active ownership rows.
5. Unit list is deduped and sorted by org name, building name, and unit label.

### 2. Fetch owner profile and accessible owner profiles

1. Controller accepts `GET /owner/me`.
2. Service loads the authenticated user profile.
3. Service loads active owner grants and owner profile rows.
4. Duplicate owners are deduped by `ownerId`.
5. Response returns:
   - `user` account profile
   - `owners` list of accessible owner profiles

### 3. Update owner account profile

1. Controller accepts `PATCH /owner/me/profile`.
2. Service verifies user exists.
3. Optional fields are updated: `name`, `avatarUrl`, `phone`.
4. Response returns the updated account profile.

### 4. Update org-local owner profile

1. Controller accepts `PATCH /owner/profiles/:ownerId`.
2. Service verifies the caller has an active access grant for that owner.
3. `email` is normalized, and empty strings are coerced to `null`.
4. Optional fields are updated: `email`, `phone`, `address`.
5. Response returns the updated owner profile within the org context.

### 5. List owner units and portfolio summary

1. `GET /owner/portfolio/units` returns all accessible units.
2. `GET /owner/portfolio/summary` computes unit, org, and building counts from that list.

### 6. Fetch current tenant for an accessible unit

1. Controller accepts `GET /owner/portfolio/units/:unitId/tenant`.
2. Service checks unit is accessible for the owner.
3. Latest active occupancy is loaded by `unitId` and `status=ACTIVE`.
4. Response returns tenant user details or `null` if the unit is vacant.

### 7. List owner-accessible maintenance requests

1. Controller accepts `GET /owner/portfolio/requests`.
2. Service resolves accessible unit IDs.
3. Requests are loaded by `unitId in scope`.
4. Request rows are enriched with:
   - requester context
   - tenancy context
5. Response maps to owner portfolio request DTOs.

### 8. Get maintenance request detail

1. Controller accepts `GET /owner/portfolio/requests/:requestId`.
2. Service uses the same scoped list as above, then filters by ID.
3. If the request is not found in scope, returns `404`.

### 9. Approve or reject owner approval

1. `POST /owner/portfolio/requests/:requestId/approve` or `/reject`.
2. Request must be in scope and currently `PENDING`.
3. Update applies owner decision, timestamps, and audit record.
4. Emits maintenance request events for notifications.
5. Returns the updated request view.

### 10. Comment on requests and track unread counts

1. `GET /owner/portfolio/requests/:requestId/comments` returns only `SHARED` comments.
2. Reading comments updates `OwnerRequestCommentReadState` with the last comment timestamp.
3. `POST /owner/portfolio/requests/:requestId/comments` creates a shared comment authored by the owner and marks it read for the author.
4. `GET /owner/portfolio/requests/comments/unread-count` returns a count of shared comments created after the owner’s last read time.

## Read Models And Response Shapes

### Owner profile response

- `OwnerMeResponseDto` returns:
  - `user` account profile
  - `owners` list of owner profiles by org

### Unit response

- `OwnerPortfolioUnitResponseDto` returns:
  - `orgId`, `orgName`
  - `ownerId`
  - `unitId`, `unitLabel`
  - `buildingId`, `buildingName`

### Request response

- `OwnerPortfolioRequestResponseDto` returns:
  - unit and building context
  - request core fields
  - `ownerApproval` summary
  - requester and tenancy context
  - attachments and assigned-to metadata

### Comment response

- Only `SHARED` comments are returned.
- Each comment includes author info and author type.

## Validation And Defaults

- Approval rejection requires a non-empty `approvalReason`.
- Approval accept allows optional `approvalReason`.
- Owner profile updates normalize email and trim strings to `null` when empty.
- Tenant lookup returns `null` for accessible vacant units, not a 404.

## Data And State Model

### Core tables touched directly

- `OwnerAccessGrant`
- `Owner`
- `Unit`
- `UnitOwnership`
- `Occupancy`
- `MaintenanceRequest`
- `MaintenanceRequestComment`
- `OwnerRequestCommentReadState`
- `MaintenanceRequestOwnerApprovalAudit`

### External/domain side effects

- Emits maintenance-request events for approvals and comments.
- Requester context and tenancy context are enriched via maintenance-request helpers.

## Edge Cases And Important Scenarios

- No active grant, disabled grant, or inactive owner removes access immediately.
- Same party in a second org does not grant access without a separate active grant.
- Tenant lookup returns `null` for an accessible but vacant unit.
- Ownership reassignment revokes old owner access and grants new owner access.
- Fallback to `Unit.ownerId` covers migration gaps when no active `UnitOwnership` row exists.
- Comments and unread counts are scoped to `SHARED` visibility only.
- Requests outside scope return `404` even if the ID exists elsewhere.

## Strengths

- Clear separation of owner access resolution from org RBAC.
- Good coverage for cross-org isolation and reassignment scenarios.
- Owner approval decisions are audited and evented.
- Comment read-state is tracked at the owner-user level.

## Risks And Design Weaknesses

### 1. Owner scope resolution is heavy per request

- Multiple calls re-resolve owner scope and unit lists for each endpoint.
- That is safe, but it can be expensive under large portfolios.

### 2. Request access list uses a full scan per owner call

- `listAccessibleRequests` loads all scoped requests and then filters in memory for single ID lookup.
- For large portfolios this could become slow without pagination.

### 3. Approval guarding uses 404 for non-pending states

- Approve/reject endpoints return `404` when status is not `PENDING`.
- This is defensive, but may be confusing for API clients expecting `409`.

## Improvement Opportunities

### High priority

- Add pagination and filtering to `GET /owner/portfolio/requests`.
- Add a direct `getAccessibleRequestById` query instead of filtering the full list.

### Medium priority

- Cache owner scope with explicit invalidation on grant changes and ownership changes.
- Add explicit owner-action audit summaries in the owner portal.

### Lower priority

- Add rate-limited request list summaries if owners manage very large portfolios.
- Add a dedicated endpoint for listing active tenants across accessible units.

## Concrete Review Questions For Your Lead

1. Do we want to expose pagination and filtering now for owner request lists?
2. Is returning `404` for non-pending approvals intentional, or should it be `409`?
3. Is the Unit.ownerId fallback still needed, and can we set a removal date?
4. Do we want a dedicated owner audit report view beyond per-request details?

## Testing Signals

### Integration coverage already present

- `test/owner-portfolio.e2e.spec.ts`
- `test/owner-request-approvals.e2e.spec.ts`

### Notable cases already tested

- grant enabled and disabled behavior
- inactive owner behavior
- same-party cross-org isolation
- unit owner reassignment
- fallback to `Unit.ownerId` when no active ownership rows exist
- request visibility and comment visibility
- owner approvals and audit trails
