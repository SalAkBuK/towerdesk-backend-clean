# Feature Overview (Start Small)

This document is a plain-language guide to product features and the main flows. It starts with a small, high-signal slice of the platform so it stays readable.

If you want the next slice, say the word and I will extend this doc.

## 1. Authentication And Access Control

### What this does

- Lets users sign in, refresh sessions, and reset passwords.
- Applies role-based permissions and org scoping for all backend actions.

### Core flows

1. Sign in and obtain access/refresh tokens.
2. Refresh tokens to keep a session alive.
3. Forgot password -> reset via OTP.
4. Org-scoped access: every request is tied to an org.
5. Permission checks: endpoints require explicit permission keys.

### Common scenarios

- New staff user completes invite and sets password.
- Admin resets a user’s password and forces change on next login.
- A user attempts a restricted action and receives a 403.

### Practical notes

- Org scoping happens everywhere: cross-org access looks like not found.
- Permission sets are seeded in Prisma and mapped to roles.

## 2. Users (Org Staff)

### What this does

- Manages org staff users (listing, basic profiles, status).
- Lets users update their own profile and avatar.

### Core flows

1. List org users (admin/staff directory).
2. Create or provision new org users.
3. Update user profile (self or admin).
4. Upload avatar (self).

### Common scenarios

- Admin adds a staff member and assigns a role.
- User updates their own profile details.
- Admin disables a user who left the organization.

### Practical notes

- The self-profile endpoints are distinct from org-user admin APIs.
- Org-user permissions are enforced per endpoint.

## 3. Buildings

### What this does

- Manages buildings (properties) for an org.
- Acts as the container for units, residents, maintenance, and parking.

### Core flows

1. Create a building.
2. Update building metadata.
3. List buildings in org.
4. Delete or archive a building (if supported by policy).

### Common scenarios

- Org creates a new building as inventory grows.
- Building metadata changes (address, timezone, amenities).
- Staff lists buildings to attach units or residents.

### Practical notes

- Most downstream modules validate building ownership in org.
- Building access intersects with assignment-based access for managers.

## 4. Units

### What this does

- Manages individual units inside buildings.
- Stores unit metadata, owner references, and amenity linkage.
- Supports CSV import for large inventories.

### Core flows

1. Create a unit with optional owner and amenities.
2. Update unit fields and ownership pointer.
3. List units or get detailed unit profile.
4. CSV import with dry-run and upsert.

### Common scenarios

- Bulk import a building’s unit list from CSV.
- Change a unit’s owner and sync ownership history.
- List vacant units for leasing workflows.

### Practical notes

- Unit labels are unique per building.
- CSV import has strict validation and duplicate detection.
- Unit owner changes invoke ownership sync logic.

## 5. Access Control (Roles + Permissions)

### What this does

- Controls what each user can do.
- Enforces permission keys per endpoint.

### Core flows

1. Map roles to permissions in seed data.
2. Resolve a user’s effective permissions for requests.
3. Gate endpoints via `@RequirePermissions(...)`.

### Common scenarios

- Admin can create units but manager cannot.
- Read-only roles can list but not update.
- Missing permission -> `403`.

### Practical notes

- Permission logic is centralized and consistent.
- New endpoints should always define required permissions.

## 6. Residents, Occupancies, And Leases

### What this does

- Tracks who lives in which unit and under what lease.
- Separates resident profiles from occupancy status and lease terms.

### Core flows

1. Create or invite a resident.
2. Create an occupancy linking resident to unit.
3. Create a lease for the occupancy.
4. Update or end an occupancy when a resident moves out.
5. Renew or replace a lease on the same occupancy.

### Common scenarios

- New tenant onboarded: resident profile -> occupancy -> lease.
- Resident moves out: end occupancy, end lease, unit becomes vacant.
- Lease renews without changing the resident or unit.

### Practical notes

- Occupancy is the live “resident lives here now” state.
- Lease is the contractual record tied to an occupancy.
- Many downstream features (parking, maintenance, owner views) depend on active occupancy/lease state.

## 7. Owners And Owner Portfolio

### What this does

- Manages property owners and their relationship to units.
- Powers the owner-facing portal views and approval workflows.

### Core flows

1. Create or update an owner record.
2. Resolve owner identity using strong identifiers (party resolution).
3. Assign owners to units and maintain ownership history.
4. Provide owner portal views (units, requests, documents).
5. Run owner approval workflows for maintenance or access items.

### Common scenarios

- Add a new owner and link them to multiple units.
- Owner identity matches an existing party record and is reused.
- Ownership changes are reflected in owner-facing views.
- Owner approves a maintenance request or document.

### Practical notes

- Owner identity resolution uses masked identifiers and HMAC lookup.
- Ownership history is tracked separately from `Unit.ownerId`.
- Owner portal views are filtered to only the owner’s units and records.

## 8. Maintenance Requests

### What this does

- Tracks resident and staff maintenance requests.
- Supports assignment to staff or providers, approvals, estimates, and status progression.

### Core flows

1. Resident or staff creates a maintenance request.
2. Request is assigned to a staff member or service provider.
3. Optional approvals/estimates are collected.
4. Work progresses through statuses (open -> assigned -> in progress -> completed).
5. Request can be canceled or closed.

### Common scenarios

- Resident reports an issue; staff assigns a technician.
- Provider submits an estimate; owner approves before work begins.
- Maintenance request is completed and recorded for history.

### Practical notes

- Requests are org-scoped and typically building-scoped.
- Status transitions drive activity feeds and dashboards.
- Approvals can be required depending on org policy or owner rules.

## 9. Notifications, Messaging, And Broadcasts

### What this does

- Sends system notifications to users (in-app + realtime).
- Supports direct messaging between org users and residents/owners.
- Provides broadcast announcements to audiences.

### Core flows

1. System event creates a notification (e.g., maintenance update).
2. Notification can be delivered via realtime socket and stored for later.
3. Users can mark notifications read or dismissed.
4. Messaging creates a conversation and posts messages.
5. Broadcasts target an audience and fan out into notifications.

### Common scenarios

- Resident submits a request and receives a realtime update.
- Staff sends a direct message to a resident or owner.
- Admin sends a building-wide announcement.

### Practical notes

- Realtime notifications use Socket.IO under `/notifications`.
- Broadcasts are aggregated and recorded with recipient counts.
- Messaging and notifications are org-scoped.

## 10. Visitors

### What this does

- Manages guest and delivery visitor registrations.
- Supports resident-initiated and staff-initiated visitor flows.

### Core flows

1. Resident or staff creates a visitor entry.
2. Visitor status changes over time (expected -> arrived -> departed/canceled).
3. Staff lists visitors for building security or front desk use.

### Common scenarios

- Resident pre-registers a guest.
- Staff checks in a visitor on arrival.
- Visitor record is marked departed at exit.

### Practical notes

- Visitor records are org- and building-scoped.
- Status changes may drive activity feeds.

## 11. Parking

### What this does

- Manages parking slots and allocations.
- Tracks vehicles linked to occupancies.

### Core flows

1. Create or import parking slots for a building.
2. Allocate slots to an occupancy or unit.
3. End allocations when needed.
4. Register vehicles for an occupancy.

### Common scenarios

- Auto-allocate 2 slots for a new occupancy.
- End all allocations when a lease ends.
- Add or update vehicle plate numbers.

### Practical notes

- Allocation requires active occupancy + lease when targeting occupancy.
- Unit-based allocations exist for non-tenant parking needs.
- CSV import supports dry-run and upsert.

## 12. Dashboard

### What this does

- Aggregates KPIs and activity into a dashboard view.
- Merges events across maintenance, visitors, parking, and broadcasts.

### Core flows

1. Overview endpoint compiles org summary metrics.
2. Activity endpoint merges recent events into a feed.

### Common scenarios

- Staff checks occupancy rate and open maintenance count.
- Admin reviews recent activity across buildings.

### Practical notes

- Trends are built from the last 30 days.
- Activity is capped and sorted by timestamp.

## 13. Org Profile

### What this does

- Stores org business identity and contact details.
- Allows updates by users with proper permission.

### Core flows

1. Any org user reads the profile.
2. Authorized users update business metadata.

### Common scenarios

- Admin updates the business address or phone number.
- Org changes branding/logo URL.

### Practical notes

- Write requires `org.profile.write`.
- No file upload; logo is a URL.

## 14. Health

### What this does

- Exposes a simple liveness signal for deployments.

### Core flows

1. `GET /health` returns `{ status: "ok", timestamp }`.

### Practical notes

- This is liveness only, not readiness.
- No dependency checks are performed.

## Next Slice (If You Want It)

- Owners + Owner Portfolio
- Maintenance Requests
- Notifications + Messaging + Broadcasts
- Visitors + Parking
- Dashboard + Org Profile
