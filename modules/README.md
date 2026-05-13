# Backend Module Review Index

This folder is a review set for the current backend under `src/modules`.
It is organized so a lead can scan the full surface first, then open one module at a time for workflows, edge cases, dependencies, and likely improvement areas.

## How To Read This Set

- Start with `docs/BACKEND-CAPABILITIES.md` for the leadership summary.
- Then read `docs/BACKEND-CAPABILITIES-V2.md` for the more candid technical capability brief.
- Then read `docs/BACKEND-HARDENING-ROADMAP.md` if the discussion is about execution order or hardening work.
- Then use `docs/FEATURES-FLOWS.md` for end-to-end flows.
- Start here to understand the module map.
- Open the feature file for the module you want to review.
- Treat each file as a review aid, not a generated API reference.
- Use the linked source folders, `docs/API.md`, `docs/backend-module-spec.md`, and the `test/` suite when a discussion needs implementation proof.

## Detailed Pass Status

- Detailed step-by-step pass completed: `auth`
- Detailed step-by-step pass completed: `access-control`
- Detailed step-by-step pass completed: `users`
- Detailed step-by-step pass completed: `buildings`
- Detailed step-by-step pass completed: `units`
- Detailed step-by-step pass completed: `unit-types`
- Detailed step-by-step pass completed: `occupancies`
- Detailed step-by-step pass completed: `residents`
- Detailed step-by-step pass completed: `leases`
- Detailed step-by-step pass completed: `owners`
- Detailed step-by-step pass completed: `owner-portfolio`
- Detailed step-by-step pass completed: `maintenance-requests`
- Detailed step-by-step pass completed: `service-providers`
- Detailed step-by-step pass completed: `notifications`
- Detailed step-by-step pass completed: `messaging`
- Detailed step-by-step pass completed: `broadcasts`
- Detailed step-by-step pass completed: `visitors`
- Detailed step-by-step pass completed: `parking`
- Detailed step-by-step pass completed: `dashboard`
- Detailed step-by-step pass completed: `org-profile`
- Detailed step-by-step pass completed: `parties`
- Detailed step-by-step pass completed: `unit-ownerships`
- Detailed step-by-step pass completed: `health`
- Skipped by request: `platform`
- Next recommended order: none (module set complete)

## Public Feature Modules

| Module | Review Doc | Notes |
| --- | --- | --- |
| Access Control | [access-control.md](./access-control.md) | RBAC, role templates, scoped assignments, permission overrides |
| Auth | [auth.md](./auth.md) | Login, tokens, password lifecycle, invite completion hooks |
| Broadcasts | [broadcasts.md](./broadcasts.md) | Audience-targeted announcements that fan out into notifications |
| Building Amenities | [building-amenities.md](./building-amenities.md) | Building amenity catalog used by units |
| Building Assignments | [building-assignments.md](./building-assignments.md) | Legacy-compatible read view over building-scoped access |
| Buildings | [buildings.md](./buildings.md) | Core org property container |
| Dashboard | [dashboard.md](./dashboard.md) | Org KPIs and recent activity aggregation |
| Health | [health.md](./health.md) | Liveness endpoint only |
| Leases | [leases.md](./leases.md) | Contracts, lifecycle, documents, access items, resident views |
| Maintenance Requests | [maintenance-requests.md](./maintenance-requests.md) | Resident, building-ops, provider, approval, estimate workflows |
| Messaging | [messaging.md](./messaging.md) | Org, owner, and resident private conversation flows |
| Notifications | [notifications.md](./notifications.md) | Stored notifications, owner scope, realtime, and push devices |
| Occupancies | [occupancies.md](./occupancies.md) | Resident-to-unit occupancy state |
| Org Profile | [org-profile.md](./org-profile.md) | Org business/profile details |
| Owner Portfolio | [owner-portfolio.md](./owner-portfolio.md) | Owner runtime portal and owner approval views |
| Owners | [owners.md](./owners.md) | Org owner registry, identity resolution, access grants |
| Parking | [parking.md](./parking.md) | Slots, allocations, vehicles, resident parking view |
| Platform | [platform.md](./platform.md) | Cross-org org and admin bootstrap |
| Residents | [residents.md](./residents.md) | Resident onboarding, invites, profiles, resident directory |
| Service Providers | [service-providers.md](./service-providers.md) | Provider registry, provider portal, admin grants |
| Unit Types | [unit-types.md](./unit-types.md) | Org-scoped unit-type catalog |
| Units | [units.md](./units.md) | Unit CRUD, import, occupancy-aware detail |
| Users | [users.md](./users.md) | Self profile plus org user listing/provisioning |
| Visitors | [visitors.md](./visitors.md) | Staff and resident visitor registration flows |

## Internal / Support Modules

| Module | Review Doc | Notes |
| --- | --- | --- |
| Parties | [parties.md](./parties.md) | Shared identity-resolution helpers used by owner flows |
| Unit Ownerships | [unit-ownerships.md](./unit-ownerships.md) | Ownership history and active-owner invariants |

## Wiring Notes

- App-level imports live in `src/app.module.ts`.
- `parties` and `unit-ownerships` are support modules and are consumed by feature modules rather than imported directly by `AppModule`.
- Some areas intentionally expose both new and compatibility routes, especially RBAC and building assignment reads.

## Suggested Review Order

1. `auth`, `access-control`, `users`, `platform`
2. `buildings`, `units`, `unit-types`, `occupancies`, `residents`, `leases`
3. `owners`, `owner-portfolio`, `service-providers`, `maintenance-requests`
4. `notifications`, `messaging`, `broadcasts`, `visitors`, `parking`, `dashboard`
5. `parties`, `unit-ownerships`, `health`, `org-profile`

## Common Cross-Cutting Themes

- Org scoping and cross-org non-leak behavior are central almost everywhere.
- Building-scoped authority is mixed between permission checks and assignment-derived access.
- Several modules have strong business behavior in services and tests, but only light explicit architecture docs.
- File upload/storage and async job usage exist in infrastructure but are still unevenly adopted in feature modules.
