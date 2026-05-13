# Backend Capabilities Brief

This document is the leadership-facing summary of what the backend can do today.

It is not an API reference. It is a capability map for product, engineering, and delivery discussions.

If someone needs implementation depth, use this together with:

- `modules/README.md`
- `modules/*.md` for module-by-module review
- `docs/BACKEND-CAPABILITIES-V2.md` for the less-sanitized technical capability brief
- `docs/BACKEND-HARDENING-ROADMAP.md` for execution priorities and sequencing
- `docs/FEATURES-FLOWS.md` for step-by-step flow walkthroughs

## 1. Executive Summary

The backend already supports the core operating model for a property-management platform with org scoping, role-based access control, property inventory, resident lifecycle, owner lifecycle, service-provider collaboration, maintenance operations, realtime notifications, communication, visitors, parking, and dashboard reporting.

At a high level, the system can:

- bootstrap organizations and first admins from a platform-superadmin context
- authenticate users and enforce org-scoped permissions
- manage buildings, units, unit types, and building amenities
- onboard residents and track occupancies and leases
- onboard owners, track ownership history, and support owner-facing workflows
- onboard service providers and run provider-admin/provider-staff portal flows
- create, assign, approve, and complete maintenance requests
- deliver notifications, messages, and broadcasts
- handle visitor registration and parking allocation
- expose summary metrics and recent activity in a dashboard

## 2. What The Backend Can Do

### A. Platform And Organization Bootstrap

What it supports:

- create organizations from a platform context
- create org-admin users for those organizations
- keep platform users separate from normal org-scoped routes
- support first-login password change flows for newly created org admins

Primary modules:

- `platform`
- `auth`
- `access-control`

Business value:

- allows controlled rollout of new customer organizations
- provides a clean bootstrap path instead of manual database setup

### B. Identity, Authentication, And Access Control

What it supports:

- login with JWT access and refresh tokens
- refresh-token session continuation
- forgot-password and reset-password flows
- invite completion and forced password-change flows
- org-scoped request handling
- permission-gated endpoints with role mappings
- building-scoped access patterns where needed

Primary modules:

- `auth`
- `access-control`
- `users`
- `building-assignments`

Business value:

- makes the backend safe for multi-org use
- allows different staff roles to operate with controlled access

### C. Org User Administration

What it supports:

- list org users
- provision staff users
- manage self-profile data
- upload avatars
- enforce org-local user visibility

Primary modules:

- `users`
- `auth`
- `access-control`

Business value:

- supports org staffing and day-to-day account administration

### D. Property Structure And Reference Data

What it supports:

- create and manage buildings
- create and manage units
- import units from CSV with dry-run and upsert support
- manage unit types per org
- manage building-level amenities
- expose building assignment compatibility reads for legacy consumers

Primary modules:

- `buildings`
- `units`
- `unit-types`
- `building-amenities`
- `building-assignments`

Business value:

- gives the product its property and inventory foundation
- supports both manual admin data entry and bulk onboarding

### E. Resident Lifecycle

What it supports:

- create or invite residents
- maintain resident directory data
- create occupancies linking residents to units
- create and manage leases for those occupancies
- expose resident-safe views where appropriate

Primary modules:

- `residents`
- `occupancies`
- `leases`

Business value:

- supports move-in, active tenancy, renewal, and move-out workflows
- provides the operational basis for maintenance, visitors, parking, and notifications

### F. Owner Lifecycle And Owner Portal

What it supports:

- create and manage owner records
- resolve owner identity safely using strong identifiers
- assign owners to units
- preserve ownership history in a separate ownership table
- expose owner-portfolio views scoped to the owner's assets
- support owner-facing approval flows where business rules require it

Primary modules:

- `owners`
- `owner-portfolio`
- `parties`
- `unit-ownerships`

Business value:

- supports owner operations without relying only on a simple `Unit.ownerId`
- enables owner visibility and approval workflows with better traceability

### G. Service Provider Registry And Provider Portal

What it supports:

- create and manage provider records
- link providers to org buildings
- invite provider admins
- activate provider access grants
- support provider-admin and provider-staff memberships
- expose provider self-service portal functionality

Primary modules:

- `service-providers`
- `auth`

Business value:

- supports outsourced work and vendor collaboration without mixing provider users into org-staff roles

### H. Maintenance Operations

What it supports:

- create maintenance requests from resident or staff context
- assign work to internal staff or providers
- capture approval and estimate-driven workflows
- move requests through lifecycle states
- preserve request history for operations and reporting

Primary modules:

- `maintenance-requests`
- `owners`
- `service-providers`
- `notifications`

Business value:

- covers one of the highest-value operational workflows in a property platform

### I. Communications And Realtime Engagement

What it supports:

- stored notifications
- realtime notification delivery over Socket.IO
- read, read-all, dismiss, and undismiss notification flows
- direct messaging across supported user types
- audience-targeted broadcasts that fan out into notifications

Primary modules:

- `notifications`
- `messaging`
- `broadcasts`

Business value:

- supports product responsiveness and day-to-day communication
- reduces the need for external communication channels for many flows

### J. Front Desk And Resident Convenience Flows

What it supports:

- visitor preregistration and visitor-status workflows
- staff visitor listing and operational handling
- parking-slot inventory
- parking-slot CSV import
- parking allocation to occupancies or units
- occupancy-linked vehicle registration
- resident self-view of active parking allocation

Primary modules:

- `visitors`
- `parking`

Business value:

- supports on-site operations beyond pure leasing and accounting data

### K. Reporting, Profile, And Health

What it supports:

- dashboard overview metrics
- recent activity feed aggregated across multiple domains
- org business/profile details
- simple health/liveness endpoint

Primary modules:

- `dashboard`
- `org-profile`
- `health`

Business value:

- gives operators a summary layer
- supports deployment monitoring and business identity management

## 3. Major End-To-End Business Flows The Backend Supports

### 1. New Org Bootstrap

1. Platform admin creates org.
2. Platform admin creates first org admin.
3. Org admin logs in and completes password-change flow.
4. Org admin can start configuring buildings, users, and permissions.

### 2. Roles First, Then Users

1. Org defines which roles it needs.
2. Permission mappings are applied through access-control structures.
3. Org users are provisioned against those roles.
4. Users log in and operate only within granted permissions.

### 3. Building Onboarding

1. Org creates building.
2. Org creates unit types and amenities.
3. Org creates units manually or imports them from CSV.
4. Optional owners are linked to units.
5. Building is ready for resident and parking workflows.

### 4. Resident Move-In

1. Resident is created or invited.
2. Occupancy is created for a unit.
3. Lease is created for the occupancy.
4. Optional parking is allocated and vehicles are registered.
5. Resident can now use maintenance, notifications, and visitor features.

### 5. Owner Onboarding

1. Owner record is created or matched through party resolution.
2. Owner is linked to units.
3. Ownership history is preserved.
4. Owner portfolio views reflect owned units and related flows.

### 6. Maintenance Lifecycle

1. Request is opened by resident or staff.
2. Staff assigns work internally or to a provider.
3. Estimate and approval steps run when required.
4. Request progresses to completion or cancellation.
5. Notifications and dashboard activity reflect the lifecycle.

### 7. Provider Onboarding And Operation

1. Org creates or links a provider.
2. Org invites provider admin through an access grant.
3. Provider admin activates access and manages provider profile/staff.
4. Provider participates in operational flows such as maintenance.

### 8. Visitor And Parking Operations

1. Visitor is preregistered or created by staff.
2. Visitor status changes through arrival/departure flow.
3. Parking inventory is loaded.
4. Parking is allocated to occupancies or units.
5. Resident and staff can see current parking state where supported.

## 4. Important Cross-Cutting Rules

These are the big rules the backend repeatedly enforces:

- org scoping is central almost everywhere
- cross-org access should fail closed
- permissions are explicit and endpoint-level
- building-scoped authority is mixed between permission checks and assignment-derived access
- resident, owner, provider, and org-staff roles are intentionally separate concepts
- several workflows depend on active occupancy and active lease state
- realtime notification access still obeys auth and org scope

## 5. Key Invariants The Backend Protects

- a unit should not have multiple active ownership rows
- a parking slot should not have multiple active allocations
- owner identity resolution should not leak raw identifier values
- unit labels should be unique within a building
- many "not found" responses are actually part of org-isolation behavior

## 6. Capability Boundaries And Current Caveats

This is what the backend does, but these are the areas a lead should keep in mind:

- some compatibility routes still exist for older clients, especially around building assignments
- ownership is mid-transition from simple unit owner pointer to ownership-history model
- dashboard trends are currently simpler than a full BI/reporting layer
- health endpoint is liveness only, not full readiness
- provider access-grant behavior is powerful but subtle and should stay well documented
- platform routes are high-trust administrative routes and deserve stronger audit/monitoring over time

## 7. Best Reading Order For A Team Lead

If the goal is fast understanding, use this order:

1. This file for capability map: `docs/BACKEND-CAPABILITIES.md`
2. Flow walkthroughs: `docs/FEATURES-FLOWS.md`
3. Module index: `modules/README.md`
4. Detailed module reviews:
   - `modules/auth.md`
   - `modules/access-control.md`
   - `modules/users.md`
   - `modules/buildings.md`
   - `modules/units.md`
   - `modules/residents.md`
   - `modules/leases.md`
   - `modules/owners.md`
   - `modules/maintenance-requests.md`
   - `modules/notifications.md`

## 8. Short Leadership Takeaway

The backend is already capable of running the main operational model of a multi-building property platform: org setup, secure staff access, inventory setup, resident lifecycle, owner lifecycle, provider collaboration, maintenance handling, communication, visitor/parking operations, and dashboard reporting.

The next conversation for a lead is not "does the backend do enough to support the product?" The better question is "which of these capabilities need stronger polish, auditability, UX support, or scale-readiness first?"
