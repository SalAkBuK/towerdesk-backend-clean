# Vendor / Service Provider MVP Plan

Last updated: April 6, 2026

This document describes the original org-scoped provider MVP.

It is now superseded by the implemented global service-provider directory plus `/provider/*` portal model.

## Recommendation

Build the vendor/service-provider MVP next, ahead of unread-count and admin-visibility polish.

Reason:

- Vendor assignment unlocks a new operational workflow for buildings.
- The admin visibility items are valuable, but they improve workflows that already exist.
- The current codebase can support a bounded vendor MVP if we avoid true cross-org vendor tenancy in v1.

## Core MVP Decision

For MVP, model service providers inside the building org, not as fully separate tenant orgs.

Meaning:

- A building org creates `ServiceProvider` records.
- A provider has employees, but those employees are standard users in the same org.
- Provider employees get restricted request access through provider membership plus scoped permissions.
- The provider does not get its own `/org/*` tenant boundary in v1.

This is the correct MVP tradeoff because current auth and RBAC are single-org oriented:

- `User.orgId` is singular in [`prisma/schema.prisma`](../prisma/schema.prisma).
- Maintenance requests currently support only one internal assignee via `assignedToUserId` in [`prisma/schema.prisma`](../prisma/schema.prisma).
- Request assignment/status checks assume building staff inside the same org in [`src/modules/maintenance-requests/maintenance-requests.service.ts`](../src/modules/maintenance-requests/maintenance-requests.service.ts).

If we instead model vendors as separate org tenants now, we would need cross-org request visibility, cross-org assignment, cross-org notifications, and a new access model on top of the current `/org/*` guard assumptions. That is too much for MVP.

## Product Scope

### In scope

- Building org can create and manage service providers.
- Building org can link providers to one or more buildings.
- Building org can create provider employees.
- Building org can assign a maintenance request to a provider.
- Provider manager can assign the request to a provider employee.
- Provider employee can:
  - list only requests assigned to their provider
  - view request details
  - add shared comments
  - upload attachments
  - move request status to `IN_PROGRESS` and `COMPLETED`
- Building management can:
  - reassign from one provider to another
  - reassign between provider employees
  - cancel requests
  - retain owner approval control

### Out of scope

- Separate vendor org portals
- Multi-client vendor accounts across unrelated orgs
- Quotes, invoices, purchase orders, SLA tracking
- Scheduling/dispatch calendars
- Vendor analytics/reporting beyond basic request views
- Messaging redesign
- Billing and contract management

## Data Model

### New entities

Add:

- `ServiceProvider`
- `ServiceProviderBuilding`
- `ServiceProviderUser`

Suggested shape:

`ServiceProvider`

- `id`
- `orgId`
- `name`
- `serviceCategory` or `serviceTypes`
- `contactName`
- `contactEmail`
- `contactPhone`
- `notes`
- `isActive`
- `createdAt`
- `updatedAt`

`ServiceProviderBuilding`

- `serviceProviderId`
- `buildingId`
- `createdAt`

`ServiceProviderUser`

- `serviceProviderId`
- `userId`
- `role`
- `isActive`
- `createdAt`

Suggested enum:

- `ServiceProviderUserRole`
  - `MANAGER`
  - `WORKER`

### Maintenance request changes

Extend `MaintenanceRequest` with:

- `serviceProviderId?`
- `serviceProviderAssignedUserId?`
- `assignedAt?` stays reused

Keep `assignedToUserId` for internal building staff assignment.

Runtime rule:

- A request can be assigned either to internal staff or to a provider, not both at once.
- If assigned to provider:
  - `assignedToUserId = null`
  - `serviceProviderId != null`
  - `serviceProviderAssignedUserId` may be null until provider manager dispatches to a worker

This avoids a large migration away from the existing request lifecycle.

## RBAC Model

Do not add a new auth surface for vendors in MVP.

Use existing users plus explicit provider membership.

### New permissions

Add org-scoped permissions:

- `service_providers.read`
- `service_providers.write`
- `service_provider_users.write`
- `requests.assign_provider`
- `requests.assign_provider_worker`

### Runtime access rules

Building management:

- Can create/edit providers
- Can link providers to buildings
- Can assign request to provider
- Can reassign provider worker
- Can still perform all current building management request actions

Provider manager:

- Must be a user in the same org
- Must be active on the assigned provider
- Can read requests assigned to that provider
- Can assign provider workers on those requests
- Can add shared comments and attachments
- Can update status to `IN_PROGRESS` / `COMPLETED`

Provider worker:

- Must be a user in the same org
- Must be active on the assigned provider
- Can only see requests assigned to their provider
- Can only act on requests assigned to them, unless product wants provider-wide shared queue behavior

Recommendation:

- In MVP, workers can view provider queue items for their provider, but can only update status/comment once specifically assigned as `serviceProviderAssignedUserId`.
- Provider managers can see the full provider queue.

## API Surface

### Provider administration

Add:

- `GET /org/service-providers`
- `POST /org/service-providers`
- `GET /org/service-providers/:providerId`
- `PATCH /org/service-providers/:providerId`
- `POST /org/service-providers/:providerId/buildings`
- `DELETE /org/service-providers/:providerId/buildings/:buildingId`
- `POST /org/service-providers/:providerId/users`
- `DELETE /org/service-providers/:providerId/users/:userId`

### Maintenance request actions

Add:

- `POST /org/buildings/:buildingId/requests/:requestId/assign-provider`
  - body: `{ serviceProviderId }`
- `POST /org/buildings/:buildingId/requests/:requestId/assign-provider-worker`
  - body: `{ userId }`
- `POST /org/buildings/:buildingId/requests/:requestId/unassign-provider`

### Provider-facing request endpoints

Add:

- `GET /org/provider/requests`
- `GET /org/provider/requests/:requestId`
- `POST /org/provider/requests/:requestId/status`
- `POST /org/provider/requests/:requestId/comments`
- `GET /org/provider/requests/:requestId/comments`
- `POST /org/provider/requests/:requestId/attachments`
- `POST /org/provider/requests/:requestId/assign-worker`

Do not overload current building request controllers with provider-only semantics. Keep provider-facing flows separate.

## Request Lifecycle Rules

### Assignment

- Owner approval rules remain unchanged.
- If owner approval is `PENDING`, provider assignment is blocked.
- Building manager/admin assigns request to provider.
- Provider manager optionally assigns request to worker.
- Reassignment clears any stale provider-worker assignment if provider changes.

### Status

- Building side can still move status according to existing rules.
- Provider manager or provider worker can move:
  - `ASSIGNED -> IN_PROGRESS`
  - `IN_PROGRESS -> COMPLETED`
- Provider users cannot cancel requests.
- Provider users cannot override owner approval.

### Comments

Use existing comment visibility model:

- Provider users can create `SHARED` comments only.
- Provider users cannot create `INTERNAL` comments.
- Provider users cannot read internal building-management comments.

## Notifications

MVP notification behavior should stay simple:

- Notify provider managers when a request is assigned to provider.
- Notify assigned provider worker when dispatched.
- Notify building manager/internal assignee path when provider completes request.

Do not build a broad provider notification center first.

Use the existing notification infrastructure and add recipient resolution for provider manager/worker users in the same org.

## Suggested Module Layout

Add:

- `src/modules/service-providers/service-providers.module.ts`
- `src/modules/service-providers/service-providers.controller.ts`
- `src/modules/service-providers/service-providers.service.ts`
- `src/modules/service-providers/service-providers.repo.ts`
- `src/modules/service-providers/dto/*`

Extend:

- `src/modules/maintenance-requests/*`
- `src/modules/notifications/*`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `docs/API.md`

## Rollout Order

### Slice 1: Data + admin CRUD

- Add schema
- Add provider CRUD
- Add provider-building links
- Add provider-user links
- Seed permissions
- Add tests for CRUD and access control

### Slice 2: Request assignment

- Add provider assignment fields to maintenance requests
- Add assign/unassign provider actions
- Add provider worker assignment
- Update building request responses
- Add tests for assignment and reassignment rules

### Slice 3: Provider-facing request access

- Add provider request list/detail endpoints
- Add provider status/comment/attachment actions
- Enforce comment visibility restrictions
- Add tests for worker vs manager visibility

### Slice 4: Notifications

- Notify provider manager on assignment
- Notify worker on dispatch
- Notify building side on completion
- Add focused notification tests

## Minimum E2E Coverage

Add E2E coverage for:

- create provider and link to building
- add provider manager and worker
- assign request to provider
- provider manager reads assigned queue
- provider worker cannot see unrelated provider requests
- provider manager assigns worker
- worker updates request to `IN_PROGRESS`
- worker completes request
- provider user cannot cancel request
- provider user cannot create/read internal comments
- provider assignment blocked while owner approval is `PENDING`
- reassigning provider clears prior worker assignment
- inactive provider or inactive provider membership removes access immediately

## Risks To Avoid

- Do not make provider users a second-class copy of building staff inside the same controller code. Their access rules are different enough to justify separate endpoints and service checks.
- Do not represent provider assignment as a free-text vendor name on the request. That breaks authorization and auditability immediately.
- Do not start with separate vendor tenant orgs unless the client explicitly accepts a much larger scope, longer timeline, and broader auth/RBAC changes.

## Recommendation On Priorities

Recommended next sequence:

1. Short hardening pass only for must-fix maintenance/notification issues discovered during implementation kickoff.
2. Build the vendor/service-provider MVP in the four slices above.
3. Return to unread counts, notification filtering, admin visibility, and audit/history after vendor assignment is usable end to end.

If the client insists on "vendor is its own org" from day one, treat that as a different project, not a small extension of this MVP.
