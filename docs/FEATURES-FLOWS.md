# Features And Flows (Detailed)

This document expands the high-level overview into step-by-step flows, actors, and cross-module dependencies. It is written for team leads to review behavior and edge cases without digging into code.

For the leadership summary of the full backend surface, read `docs/BACKEND-CAPABILITIES.md` first.

If any section needs deeper detail or diagrams, call it out and I will expand it.

## 1. Authentication And Access Control

### Actors

- Org admin
- Org staff
- Resident/owner (if exposed)

### Core flows

1. Login
   - User submits email + password.
   - Access and refresh tokens are issued.
2. Token refresh
   - Refresh token is exchanged for a new access token.
3. Password reset
   - User requests OTP.
   - OTP is verified.
   - Password is reset and user can log in.
4. Permission enforcement
   - Each endpoint checks required permissions.
   - Missing permission -> `403`.

### Edge cases

- Token missing or invalid -> `401`.
- Cross-org access is rejected or treated as not found.
- Password reset tokens expire and must be retried.

### Dependencies

- `access-control` module for permissions.
- `users` module for user records.

## 2. Org Staff Users

### Actors

- Org admin
- Org staff (self profile)

### Core flows

1. Admin lists staff users.
2. Admin provisions a new staff account.
3. Staff updates own profile.
4. Staff uploads avatar.

### Edge cases

- User without permission cannot create or update other users.
- Self-profile update does not affect other users.

### Dependencies

- `access-control` (permissions)
- `storage` for avatar upload

## 3. Buildings And Units

### Actors

- Org admin
- Property manager

### Core flows

1. Create building.
2. Create or import units.
3. Update unit metadata and amenities.
4. List units (basic, detail, occupancy-aware).

### Edge cases

- Unit labels must be unique per building.
- CSV import can dry-run; errors prevent writes.
- Amenities default differently for create vs update.

### Dependencies

- `unit-types`, `building-amenities`, `owners`
- `unit-ownerships` for owner sync

## 4. Residents, Occupancies, And Leases

### Actors

- Org admin
- Leasing staff
- Resident (limited views)

### Core flows

1. Resident created or invited.
2. Occupancy created linking resident to a unit.
3. Lease created for the occupancy.
4. Lease renewed or updated.
5. Occupancy ended when resident moves out.

### Edge cases

- Occupancy must be active for certain workflows (parking, vehicles).
- Lease status drives visibility in owner and maintenance flows.

### Dependencies

- `units` and `buildings` for unit linkage
- `owners` for approval workflows

## 5. Owners And Owner Portfolio

### Actors

- Org admin
- Owner

### Core flows

1. Create or update owner record.
2. Resolve owner identity using strong identifiers.
3. Link owner to units.
4. Owner accesses portal views (units, requests, docs).
5. Owner approvals for maintenance or access items.

### Edge cases

- Identity resolution blocks weak identifiers.
- Ownership history must not show multiple active owners.

### Dependencies

- `parties` for identifier normalization/HMAC
- `unit-ownerships` for history and invariants

## 6. Maintenance Requests

### Actors

- Resident
- Staff
- Service provider
- Owner (approvals)

### Core flows

1. Request created by resident or staff.
2. Request assigned to staff or provider.
3. Estimate/approval (if required).
4. Work progresses through statuses.
5. Request completed or canceled.

### Edge cases

- Approvals may gate work start.
- Request status transitions must be valid and consistent.

### Dependencies

- `residents`, `occupancies`, `owners`
- `notifications` and `broadcasts` for updates

## 7. Notifications, Messaging, And Broadcasts

### Actors

- Org admin
- Staff
- Residents/owners (recipients)

### Core flows

1. System event creates notification.
2. Notification delivered via realtime + stored.
3. Recipient marks notifications read/dismissed.
4. Messaging creates conversations and posts messages.
5. Broadcast sends announcement to an audience.

### Edge cases

- Realtime delivery depends on valid WS token.
- Broadcast recipients must be correctly scoped.

### Dependencies

- `notifications` gateway
- `access-control` for permission gating

## 8. Visitors

### Actors

- Residents
- Front desk/security staff

### Core flows

1. Visitor pre-registered by resident.
2. Staff checks in visitor (arrived).
3. Visitor checked out (departed).

### Edge cases

- Visitor access should remain building-scoped.
- Status transitions should be enforced (no “departed” before “arrived”).

### Dependencies

- `buildings`, `units`, `residents`

## 9. Parking

### Actors

- Staff
- Residents (limited)

### Core flows

1. Import or create parking slots.
2. Allocate slots to occupancy or unit.
3. End allocations.
4. Register vehicles for occupancy.

### Edge cases

- Occupancy allocation requires active lease.
- Slot already allocated -> `409`.
- Unit allocation does not emit lease activity.

### Dependencies

- `occupancies`, `leases`, `units`

## 10. Dashboard

### Actors

- Org admin
- Staff

### Core flows

1. Overview summarizes metrics.
2. Activity merges events across modules.

### Edge cases

- Trends are UTC-based, may differ from local day.
- No pagination for activity.

### Dependencies

- Reads from maintenance, visitors, parking, broadcasts, leases.

## 11. Org Profile

### Actors

- Org admin (write)
- Org staff (read)

### Core flows

1. Read org profile.
2. Update business identity fields.

### Edge cases

- `logoUrl` must be HTTPS.
- No audit trail on sensitive changes.

### Dependencies

- `access-control` for write permission.

## 12. Health

### Actors

- Load balancer / uptime monitor

### Core flows

1. GET `/health` returns status + timestamp.

### Edge cases

- Dependency outages are not detected here.

### Dependencies

- None (pure in-memory response).

## Cross-Module Dependencies (Quick Map)

- Auth -> Access Control -> all protected modules
- Buildings -> Units -> Occupancies -> Leases -> Parking/Vehicles
- Owners -> Unit Ownerships -> Owner Portfolio views
- Maintenance -> Notifications/Broadcasts -> Dashboard activity
- Visitors -> Dashboard activity

## Critical Invariants To Protect

- A request is always org-scoped and cannot cross org boundaries.
- A unit has at most one active occupancy at a time.
- A unit has at most one active ownership row.
- Parking slots cannot have multiple active allocations.
- Owner identity resolution must never expose raw identifiers.

## End-To-End Scenarios (Executive Summary)

### New building onboarding

1. Create building.
2. Import or create units.
3. Set unit types and amenities.
4. Assign owners if known.
5. Invite residents and create occupancies + leases.
6. Allocate parking as needed.

### New building onboarding (expanded)

1. Building setup
   - Actor: org admin.
   - Create building with name, address, timezone.
   - Result: building is available for unit and resident workflows.
2. Unit inventory
   - Choose import (CSV) or manual create.
   - Validate unit labels (unique per building).
   - Result: units exist for occupancy/lease flows.
3. Unit configuration
   - Attach unit type and amenities.
   - Optional: set initial owner pointer if known.
4. Owner linkage (optional)
   - Create or resolve owners.
   - Link owner to units; ownership history is created.
5. Resident onboarding
   - Invite resident or create record.
   - Create occupancy for the unit.
   - Create lease for the occupancy.
6. Parking setup (optional)
   - Import parking slots.
   - Allocate slots to occupancies.
7. Final checks
   - Verify vacancy counts and occupancy rate in dashboard.
   - Confirm owner portal reflects assigned units.

### Resident move-in

1. Create resident record (or accept invite).
2. Create occupancy for the unit.
3. Create lease for the occupancy.
4. Optional: allocate parking slots and register vehicles.
5. Resident gains access to requests, notifications, and visitor registration.

### Resident move-in (expanded)

1. Resident profile
   - Actor: staff or self via invite.
   - Create resident record or accept invite.
   - Result: resident user exists and is org-scoped.
2. Occupancy creation
   - Link resident to unit.
   - Status becomes `ACTIVE`.
   - Result: unit now considered occupied.
3. Lease creation
   - Create lease for occupancy with start/end terms.
   - Result: lease-backed workflows (parking, approvals) become available.
4. Parking and vehicles (optional)
   - Allocate parking slots to occupancy (requires active lease).
   - Register vehicles with plate numbers.
5. Resident operations
   - Resident can submit maintenance requests.
   - Resident can register visitors.
   - Resident receives notifications.

### Maintenance request lifecycle

1. Resident submits request.
2. Staff assigns or routes to provider.
3. Owner approval requested if required.
4. Work starts and status progresses.
5. Completion triggers notifications and dashboard activity.

### Maintenance request lifecycle (expanded)

1. Request intake
   - Actor: resident or staff.
   - Request created with title, building, unit, and description.
   - Status starts `OPEN`.
2. Assignment
   - Staff assigns to internal technician or provider.
   - Status moves to `ASSIGNED` or `IN_PROGRESS`.
3. Approval or estimate (optional)
   - Provider submits estimate.
   - Owner approval may be required before work begins.
4. Work execution
   - Status transitions track progress.
   - Notes and updates captured for audit visibility.
5. Completion or cancellation
   - Request marked `COMPLETED` or `CANCELED`.
   - Notifications sent to relevant parties.
   - Dashboard activity records the outcome.

### Org setup: roles first, then users (expanded)

1. Define role templates
   - Actor: org admin.
   - Decide the roles needed (e.g., admin, manager, front desk).
   - For each role, map permissions to expected responsibilities.
2. Seed or configure roles
   - If role templates are fixed in seeds, confirm the mappings.
   - If role management UI exists, create/update roles.
3. Validate permission coverage
   - Ensure critical endpoints have required permissions.
   - Confirm role mapping grants needed permissions without overreach.
4. Create users
   - Provision staff users with name, email, and role.
   - Send invites or set temporary passwords.
5. First login and verification
   - User completes login and sets password if required.
   - Test a few key actions to verify permissions match expectations.
6. Ongoing updates
   - Adjust roles as responsibilities change.
   - Remove or deactivate users who leave the org.
