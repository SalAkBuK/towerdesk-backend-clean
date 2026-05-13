# Backend Capabilities Review v2

This is the less sanitized version of the backend capability brief.

Use it when the audience needs the real shape of the system, not just the polished leadership summary in `docs/BACKEND-CAPABILITIES.md`.

It is still not an API reference. It is a technical capability map with the architectural caveats, workflow overlaps, and domain subtleties that are easy to lose in executive summaries.

## 1. Executive Truth

The backend is already a serious multi-tenant property-operations core. It supports staff, residents, owners, providers, and platform-admin flows across inventory, tenancy, maintenance, communication, visitors, parking, and reporting.

That said, some of the business power comes from dense service-layer orchestration and a few intentionally overloaded domain models. The system is strong in breadth and already useful in production-style workflows, but it is not cleanly decomposed everywhere.

The blunt version:

- this is not "just CRUD"
- several modules already behave like workflow engines
- some important concepts are still partially collapsed together
- compatibility seams and migration-era behavior still exist
- the next engineering value is mostly in hardening and clarifying, not inventing entirely new domains

## 2. What The Backend Actually Supports

### A. Platform bootstrap and org creation

What exists:

- platform-authenticated org creation
- org-admin bootstrap
- first-login password-change flow
- separation between platform and org-scoped routes

Nuances that matter:

- this is a high-trust administrative surface, not ordinary CRUD
- platform users can operate with `orgId = null` and use explicit override flows where supported
- audit and operational monitoring matter more here than the current docs fully emphasize
- the platform module exists and is reviewed, but it did not get the same deep step-by-step review pass as most other modules

Primary modules:

- `platform`
- `auth`
- `access-control`

### B. Identity, authentication, and access control

What exists:

- JWT access and refresh-token auth
- forgot-password and reset-password flows
- invite-completion hooks for resident, owner, and provider onboarding
- role templates, scoped access assignments, and direct permission overrides
- building-scoped and org-scoped authority resolution
- effective permission projection back into shared user payloads

Nuances that matter:

- access control is not only "can this user do X"
- it also projects persona and scope metadata back into the user model
- users can simultaneously appear as resident, owner, provider, building staff, and org admin
- `/roles` compatibility routes still exist beside `/role-templates`
- effective permissions are computed on demand, which is simple but could become a hotspot
- auditability for permission and assignment changes is weaker than it should be for a security-sensitive domain

Primary modules:

- `auth`
- `access-control`
- `users`
- `building-assignments`

### C. Org user administration

What exists:

- org user listing
- staff provisioning
- self-profile management
- avatar upload
- resident-oriented provisioning hooks through shared lifecycle services

Nuances that matter:

- user provisioning is not a thin insert flow; it can also apply grants and onboarding side effects
- invite delivery is post-commit and not uniformly queue-backed
- if invite sending fails after commit, the user may already exist with applied access
- this is another area where business orchestration is concentrated in services rather than controllers

Primary modules:

- `users`
- `auth`
- `access-control`

### D. Property setup and inventory

What exists:

- buildings
- building amenities
- unit-type catalog
- units CRUD
- CSV import for units
- compatibility reads for building assignment consumers

Nuances that matter:

- building access is derived from the newer RBAC v2 access-assignment model, not old mental models
- building delete is org-scoped, but the system does not expose a strong impact-preview story
- units are not plain inventory rows; owner changes trigger ownership-sync behavior
- CSV import supports dry-run and upsert, but import semantics do not perfectly mirror manual update semantics
- the system is in an ownership-model transition, so `Unit.ownerId` is not the whole truth anymore

Primary modules:

- `buildings`
- `building-amenities`
- `units`
- `unit-types`
- `building-assignments`
- `unit-ownerships`

### E. Resident lifecycle and occupancy state

What exists:

- building-scoped resident onboarding
- org-scoped resident creation without immediate occupancy
- resident invites and resend flows
- resident profile CRUD
- resident self-service identity/profile endpoints
- occupancy creation, ending, and listing

Nuances that matter:

- "resident" is inferred from profile, occupancy history, or invite history rather than one explicit state field
- this is flexible but makes the domain harder to reason about cleanly
- the residents module is really multiple surfaces grouped together: onboarding, registry, invites, profiles, and self-service
- building resident list and resident directory are different read models with different tradeoffs
- resident self-service can legitimately return a resident user with no active occupancy
- one resident can have only one active occupancy, and one unit can have only one active occupancy

Primary modules:

- `residents`
- `occupancies`
- `users`
- `auth`

### F. Contracts, leases, and move workflows

What exists:

- contract drafting
- contract activation and cancellation
- direct move-in and move-out
- reviewed resident move-in and move-out request workflow
- lease history and activity timeline
- lease documents, occupants, access cards, parking stickers, and additional terms
- resident contract and active-lease views

Nuances that matter:

- this is one of the most important architectural problem areas to explain correctly
- "contract" and "lease" are partially collapsed into one module and one core entity
- an `ACTIVE` contract does not necessarily mean the resident is moved in
- activation and move-in are separate operations
- there are two separate move-in paths:
  - direct operational move-in
  - reviewed request plus approval plus execution
- those two paths do not share one single orchestration path and can drift over time
- cancel is not always a simple status change; if occupancy exists, cancel can trigger move-out side effects first
- some write APIs intentionally replace full collections, which is efficient but destructive by design
- many contract fields become locked after activation when linked to `ijariId`

Primary modules:

- `leases`
- `occupancies`
- `residents`
- `parking`
- `notifications`

### G. Owners and owner portal

What exists:

- org-scoped owner registry
- owner-party resolution using strong identifiers
- ownership history tracking
- owner access grants
- owner portal views for portfolio, tenants, requests, approvals, and comments

Nuances that matter:

- the owner domain has two identity layers:
  - org-local owner record
  - cross-org party identity
- safe reuse depends on resolution-token flow; if teams skip that flow, duplicate party creation becomes easy
- owner portal access is grant-based, not just "owner row exists"
- same-party presence in another org does not automatically grant access
- cross-org linking by email is possible and should be treated as an explicit policy decision
- only one active owner representative is allowed today
- owner updates do not update party identity data, which is correct by design but easy for operators to misunderstand

Primary modules:

- `owners`
- `owner-portfolio`
- `parties`
- `unit-ownerships`

### H. Service providers and provider portal

What exists:

- cross-org provider registry
- provider-to-building linkage
- provider-admin invite and grant flow
- provider portal profile management
- provider staff membership management
- provider-facing maintenance participation

Nuances that matter:

- provider access grants double as onboarding gates
- if grant rows exist for a provider, they must be `ACTIVE` for access
- if no grant rows exist, membership alone can still be enough
- that dual mode is functional but subtle
- org-side updates are blocked once an admin grant becomes active
- multiple active provider memberships can create ambiguous portal context because there is no first-class provider-selection flow
- provider admins must be standalone users rather than ordinary org users

Primary modules:

- `service-providers`
- `maintenance-requests`
- `auth`

### I. Maintenance operations

What exists:

- resident intake
- building operations list/detail flows
- assignment to staff or provider
- provider worker assignment
- policy triage and queue classification
- estimate workflow
- owner approval workflow and override paths
- comments, unread tracking, and attachments
- event emission into notifications and reporting

Nuances that matter:

- this is one of the backend's strongest modules, but also one of the densest
- request policy routing mixes explicit flags with keyword heuristics
- queue classification is derived logic, not just stored status
- requester and tenancy context enrichment are built into the view model
- owner approval override has special rules, including deadline-based management override behavior
- request list queue filtering is currently done in memory, which is acceptable now but not free at scale
- a lot of logic is centralized in one service, so correctness is strong but maintainability cost is real

Primary modules:

- `maintenance-requests`
- `owners`
- `service-providers`
- `notifications`
- `dashboard`

### J. Notifications, messaging, and broadcasts

What exists:

- stored notifications
- Socket.IO realtime notifications
- push-device registration
- private messaging across org, resident, and owner surfaces
- broadcast fan-out into notifications

Nuances that matter:

- org notifications are org-scoped, but owner notifications are cross-org and grant-derived
- recipient resolution is non-trivial and currently concentrated in resolver logic rather than formal spec docs
- push delivery is synchronous today
- broadcast fan-out also still has synchronous behavior
- messaging is participant-only and not just a loose chat feature
- resident messaging depends on active occupancy
- owner messaging depends on accessible owner/unit scope
- prior conversation history can reappear when the same participant becomes active again in scope

Primary modules:

- `notifications`
- `messaging`
- `broadcasts`

### K. Visitors, parking, dashboard, org profile, and health

What exists:

- visitor registration and status workflows
- parking slots, allocations, and vehicles
- dashboard overview and activity feed
- org profile reads and updates
- health endpoint

Nuances that matter:

- resident visitor flows depend on active occupancy
- parking allocations to occupancies require active occupancy plus active lease
- unit allocations exist separately for non-tenant parking use cases
- dashboard occupancy rate is based on active occupancy count, not active lease count
- dashboard trends are UTC-based, which may misalign with org-local expectations
- dashboard activity has no pagination and is derived from live source tables rather than an immutable event log
- health is liveness only, not readiness

Primary modules:

- `visitors`
- `parking`
- `dashboard`
- `org-profile`
- `health`

## 3. Cross-Cutting Rules The System Repeats Everywhere

- org scoping is the backbone of almost every protected feature
- cross-org access usually fails closed as `404` or empty visibility rather than leaking scope
- building-scoped authority is a mix of permission checks and assignment-derived access
- downstream resident flows often depend on active occupancy, not only on user role
- parking and some operational flows depend on both active occupancy and active lease
- owner and provider access are grant-sensitive and should not be modeled mentally as ordinary org users
- compatibility routes still exist in several areas and should not be mistaken for the canonical model

## 4. Important Invariants

- one unit can have only one active occupancy
- one resident can have only one active occupancy
- a unit should not have multiple active ownership rows
- a parking slot should not have multiple active allocations
- owner identifier resolution must not expose raw identifiers
- same-party presence across orgs does not imply runtime access without an explicit active grant
- active contract, active lease, active occupancy, and moved-in resident are related concepts, but they are not interchangeable

## 5. The Messy Boundaries A Lead Must Understand

These are the places where the backend is capable but easy to misunderstand:

### Resident is not an explicit role flag

Resident-ness is inferred from multiple signals. That helps onboarding and historical views, but it weakens model clarity.

### Lease is carrying too much meaning

The leases module owns legal contract authoring, runtime tenancy state, move execution, and lease-attached operational artifacts. That is a lot of domain surface for one module and one core entity.

### Owner identity is split on purpose

The owner record is local to an org. The party record is global and identifier-backed. That split is correct, but any workflow that skips party resolution risks duplication.

### Provider access is dual-mode

Membership can be enough in some cases, but once grant rows exist they become the gate. That rule works, but it is subtle and needs documentation and UI support.

### Activity and reporting are useful, not authoritative

Dashboard and activity read from live state. They are operational summaries, not immutable reporting ledgers.

## 6. Where The Backend Is Strong Today

- functional breadth is already substantial
- the persona model is richer than many property-management backends
- key modules have meaningful integration and unit coverage
- audit posture is decent in high-risk areas such as leases, owner grants, and approval workflows
- notifications, maintenance, tenancy, and owner/provider access are already interconnected rather than isolated silos

## 7. Main Risks And Hardening Priorities

### A. Service concentration

A few services are doing too much orchestration:

- user provisioning
- resident lifecycle coordination
- lease lifecycle
- maintenance workflow

This is not broken, but it raises change risk.

### B. Async maturity is uneven

Some important side effects are still synchronous:

- invite delivery
- push delivery
- broadcast fan-out

That is fine at smaller scale and worse under load, retries, or partial failures.

### C. State machines are real but under-documented

The system already behaves like it has state machines in leases, residents, maintenance, owners, and providers. The problem is that those states are not always documented as explicit canonical machines.

### D. Some reads will get expensive first

The most obvious future pressure points are:

- request-time effective permission computation
- owner scope recomputation
- in-memory request queue filtering
- dashboard activity with no pagination

### E. Safety rails are still lighter than the business impact

Examples:

- building delete needs clearer operational policy and impact visibility
- collection-replace lease APIs are destructive by design
- health does not provide readiness
- some high-trust admin/security changes still need better audit visibility

## 8. Recommended Reading Order For Someone Serious

1. `docs/BACKEND-CAPABILITIES.md`
2. `docs/BACKEND-CAPABILITIES-V2.md`
3. `docs/BACKEND-HARDENING-ROADMAP.md`
4. lifecycle docs for the messiest domains:
   - `docs/LEASE-CONTRACT-STATE-MACHINE.md`
   - `docs/RESIDENT-LIFECYCLE-STATE-MACHINE.md`
   - `docs/OWNER-ACCESS-STATE-MACHINE.md`
5. `docs/FEATURES-FLOWS.md`
6. `modules/README.md`
7. highest-value detailed modules first:
   - `modules/access-control.md`
   - `modules/residents.md`
   - `modules/leases.md`
   - `modules/owners.md`
   - `modules/service-providers.md`
   - `modules/maintenance-requests.md`
   - `modules/notifications.md`
   - `modules/dashboard.md`

## 9. Short Honest Takeaway

The backend already behaves like the operating core for a property portfolio, not a prototype admin API.

The honest caveat is that some of that power comes from concentrated workflow logic, inferred identity rules, and partially overlapping domain models. So the next step is not "add random new features." The next step is to make the existing workflow engines easier to reason about, safer to operate, and harder to misuse.

## 10. Module-by-Module Nuance Appendix

This appendix is the "small things that matter" pass. It is meant to answer the questions that usually come up right after someone reads a polished capability summary and asks, "yes, but what does that really mean in practice?"

### A. Security and admin foundation

#### `platform`

- Owns org bootstrap and org-admin bootstrap from a platform-superadmin context.
- Supports either `x-platform-key` auth or platform-superadmin JWT auth.
- Platform users are intentionally not normal org users and can operate with `orgId = null`.
- The risky nuance is that this path seeds access and bootstraps identity, so operational mistakes here have outsized impact.
- Audit and rate limiting are more important here than the small route surface suggests.

Example:
Creating a new org is not only "insert org row." It also seeds default RBAC structures, creates the first admin path, and relies on password-change onboarding to finish the bootstrap.

#### `auth`

- Owns login, refresh, logout, password change, forgot password, and reset password.
- Validates current database truth rather than trusting stale JWT `orgId` claims.
- Stores only one refresh-token hash per user, so the current model is last-login-wins across devices.
- Reset-password is also the onboarding completion hook for resident invites, owner grants, and provider grants.
- Email delivery failure does not fail the API response, which is operationally convenient but weak for observability.

Example:
An invited provider admin can complete access by setting a password through reset-password, which simultaneously marks the reset token used, clears old refresh state, and activates the pending provider grant.

#### `access-control`

- Owns the canonical RBAC v2 model: role templates, scoped assignments, and user-level allow/deny overrides.
- Also owns the user-access projection layer, which feeds persona, building access, org access, and effective permissions into shared user payloads.
- Supports both `/role-templates` and compatibility `/roles` routes.
- Hidden system templates and platform-only permissions are intentionally filtered out in ordinary org flows.
- A subtle bug here affects auth payloads, user listings, and downstream module behavior all at once.

Example:
A user can simultaneously project as org admin, building staff, resident, and owner because the module merges assignments, active occupancy, invite state, grants, and overrides into one shared access view.

#### `users`

- Owns self-profile reads and updates, avatar upload, org user list, and org user provisioning.
- The real complexity lives in `OrgUserLifecycleService`, not the thin controllers.
- Provisioning can create or link a user, apply access assignments, create or move occupancy, and optionally trigger invite/reset onboarding.
- Invite dispatch happens after the transaction, so the database can be committed even if onboarding email fails.
- Enriched org-user list responses project the shared access model, so the endpoint is heavier than a raw `User` list.

Example:
Provisioning a resident with `resident.mode = MOVE` can end an active occupancy in the same building, create a new one on the target unit, apply baseline resident access, and then send invite onboarding.

#### `org-profile`

- Owns the editable business identity fields on `Org`.
- Read is broad to org-scoped authenticated users; write requires `org.profile.write`.
- `logoUrl` requires HTTPS, which blocks relative URLs and plain HTTP.
- Partial update is supported, but null-clearing semantics are not especially clear.
- There is no audit trail even though some fields are business-sensitive.

Example:
Changing `tradeLicenseNumber` or `businessEmailAddress` is a plain profile update today, even though those values may show up in legal or invoice-facing workflows.

#### `health`

- Owns a simple unauthenticated liveness response.
- It does not check Postgres, storage, queues, or any other dependencies.
- This is good enough for "process is up" and not good enough for "system is ready."
- No build/version metadata is included.

Example:
`GET /health` can still return `ok` even while the database is down, because the endpoint is intentionally liveness-only rather than readiness-aware.

### B. Property inventory and scoping

#### `buildings`

- Owns the base building record and the distinction between full org list and assignment-derived "my buildings."
- `GET /org/buildings/assigned` is powered by RBAC v2 access assignments, not legacy building-assignment rows.
- Delete is deceptively simple because `Building` is the root entity for units, residents, leases, visitors, parking, maintenance, and some messaging scope.
- There is no update route today.
- Org scoping is strict and client-supplied `orgId` is ignored.

Example:
Deleting a building is one route call, but operationally it may cascade into losing units, occupancies, visitor history, and parking state depending on relation behavior below this module.

#### `building-amenities`

- Owns the building-level amenity catalog that units consume.
- Default amenity behavior is subtle:
  - omitted `amenityIds` on create means "apply default active amenities"
  - `amenityIds: []` means "apply none"
- Amenity names behave like building-local business keys, so naming drift matters.
- Inactive amenities can create ambiguity when older units still reference them.

Example:
If the frontend sends no `amenityIds` while creating a unit, the backend can auto-attach the building's default amenities. If it sends an explicit empty array, the unit gets no amenities at all.

#### `unit-types`

- Owns the org-local unit-type catalog used by manual unit flows and CSV import.
- It is lookup-table data, not a workflow module.
- Public API currently exposes create and active-list only.
- The table supports `isActive`, but there is no public update/deactivate route.
- Name quality matters because imports resolve unit types by name.

Example:
An org can create `1BR`, `1 BR`, and `One Bedroom` as separate types if naming discipline is poor, and imports will then depend on exact naming rather than business intent.

#### `units`

- Owns unit create/update, detail views, occupancy-aware views, amenity links, current owner pointer, and CSV import.
- Omitted amenity behavior differs by flow:
  - create omits `amenityIds` -> apply building defaults
  - update omits `amenityIds` -> do not touch links
  - CSV create applies defaults, but CSV upsert updates do not mirror full manual update semantics
- Owner changes are not a trivial foreign-key write because they hand off to `UnitOwnershipService`.
- Vacancy means "no active occupancy," not "status says vacant."
- Response shapes differ significantly between basic, standard, detail, and occupancy-rich endpoints.

Example:
CSV upsert can update a unit label or metadata without re-running the same amenity replacement or owner-sync logic you would expect from a manual `PATCH`, which is exactly the sort of thing admins and frontend teams misread.

#### `building-assignments`

- Owns a read-only compatibility view for older clients that still expect assignment `type`.
- It is not the canonical write model anymore.
- Visibility depends on building scope plus `building.assignments.read`.
- Its main job is reducing migration breakage, not modeling a business domain.

Example:
An old client can still call `GET /org/buildings/:buildingId/assignments` and see legacy-looking assignment `type` data, even though the real source of truth is now role-template-based access assignments.

### C. Residents, occupancies, contracts, and leases

#### `residents`

- Owns building-scoped onboarding, org-scoped resident creation, resident invites, resident profiles, directory/list surfaces, and resident self-service.
- "Resident" is inferred from profile, occupancy history, or invite history, not one explicit resident-state flag.
- The building resident list and resident directory are different read models and should not be treated as identical APIs.
- Resident directory action flags are partly UI hints rather than strong backend guarantees.
- The current review surfaced at least one implementation risk: org resident search appears able to overwrite resident-only classification when `q` is used.

Example:
An org can create a resident user without occupancy, send an invite, later attach a preferred building, and that user may already classify as resident-like before ever moving in.

#### `occupancies`

- Owns direct occupancy creation plus building-scoped list and count APIs.
- It does not fully own the occupancy lifecycle because other modules also create or end occupancy rows.
- Strong invariants matter here:
  - one active occupancy per unit
  - one active occupancy per resident
- `includeProfile=true` expands the response into a much more sensitive PII surface.
- There is no public "end occupancy" route in this module.

Example:
A manager can create an occupancy directly, but a lease move-in or resident provisioning flow can also create occupancy outside this module, which means `Occupancy` is a shared primitive rather than a self-contained subdomain.

#### `leases`

- Owns contract drafting, activation, cancellation, move workflows, lease history, resident-facing contract reads, and lease-attached artifacts like documents and access items.
- The biggest nuance is that contract semantics and lease semantics are partially collapsed together.
- An `ACTIVE` contract does not automatically mean the resident has moved in.
- There are two move-in paths:
  - direct operational move-in
  - request/approve/execute flow
- Replace-style writes exist for collections like additional terms and occupants, so some APIs are destructive by design.

Example:
A contract can be activated today and still have `occupancyId = null`. That means legal/commercial state can be active while runtime resident-presence state is still not active.

### D. Ownership and external identity

#### `parties`

- Owns strong-identifier normalization, HMAC lookup, encrypted storage, safe masked output, and resolution tokens.
- Raw identifiers never leave this service boundary.
- Resolution tokens are bound to actor and org, not just to the party.
- `OTHER` identifiers are intentionally rejected for strong-resolution flows.
- The missing long-term story is key rotation and normalization-version migration.

Example:
Resolving an Emirates ID does not store or echo the raw value in logs or audit rows; the system stores lookup HMAC, encrypted value, and masked `last4` style output instead.

#### `owners`

- Owns org-local owner CRUD, owner-party reuse, and owner access-grant lifecycle.
- Owner identity is split on purpose:
  - org-local owner record
  - cross-org party identity
- Reuse is safest through resolution-token flow; skipping that flow makes duplication easier.
- Only one active owner representative is allowed today.
- Cross-org email auto-linking is possible and should be treated as a deliberate policy choice, not a harmless convenience.

Example:
If an active user already exists with the invited owner email, the grant can become `ACTIVE` immediately through email-match logic rather than staying pending for invite completion.

#### `unit-ownerships`

- Owns append-only ownership history and the single-active-owner invariant.
- Acts as the migration seam between historical `Unit.ownerId` and the newer `UnitOwnership` truth.
- `syncCurrentOwner(...)` ends old active rows and creates a new primary row only when owner truly changes.
- It trusts callers for ID validity, which is fine internally and risky if callers get sloppy.
- It preserves history but does not record actor user metadata.

Example:
Updating a unit owner from A to B does not overwrite the old ownership row. It ends A's active row and creates a fresh active row for B, while fallback reads can still consult `Unit.ownerId` during migration.

#### `owner-portfolio`

- Owns the grant-based owner portal surface rather than org-RBAC-based access.
- Runtime scope is derived from active grants, active owner rows, and current ownership state.
- Migration fallback still exists when no active `UnitOwnership` row is present and `Unit.ownerId` must be used.
- Request access currently resolves the scoped list and then filters in memory for some detail flows.
- Owner approval endpoints intentionally use scope-sensitive behavior and only expose shared comments.

Example:
An owner with access to units in two orgs can see a cross-org portfolio summary, but only where active grants exist. Sharing the same party identity in another org is not enough by itself.

### E. Providers, requests, and communication

#### `service-providers`

- Owns cross-org provider registry, building links, provider-admin invites, portal profile management, and provider staff management.
- Access rules are dual-mode:
  - if grants exist, they must be `ACTIVE`
  - if no grant rows exist, membership alone can still allow access
- Org-side updates are blocked once an admin grant becomes active.
- Multiple active memberships can make portal context ambiguous because provider selection is not first-class.
- Provider admins must be standalone users, not ordinary org users.

Example:
An org can create a provider and invite its admin. Once that admin grant becomes active, org-side edits to the provider become restricted because profile ownership has effectively shifted.

#### `maintenance-requests`

- Owns intake, triage, assignment, provider involvement, owner approvals, estimate workflow, comments, unread counts, and attachment handling.
- The module distinguishes resident, building-ops, and provider views rather than exposing one generic request shape.
- Queue classification is derived logic based on policy and state, not a simple stored enum.
- Policy routing uses both explicit flags and keyword heuristics, which is powerful but brittle.
- Some queue filtering is in-memory today, which is a real future scale concern.

Example:
A resident can create an `OPEN` request that looks minor, a keyword or amount threshold can reroute it into owner-approval territory, and provider estimate flow can then gate execution before assignment proceeds.

#### `notifications`

- Owns persistence, recipient resolution, realtime Socket.IO delivery, push-device registration, and push delivery.
- Org notifications are org-scoped; owner notifications are cross-org and grant-derived.
- Push delivery is synchronous right now.
- Recipient resolution is concentrated in one resolver and already handles provider/owner/resident edge cases.
- Socket auth supports header token, `auth.token`, or query token, and owners can join all accessible org rooms when no explicit `orgId` is provided.

Example:
When a maintenance request is reassigned, the resolver can notify the resident creator, current assignee, prior assignee, ops recipients, and owners in emergency cases, all from one event source.

#### `messaging`

- Owns private conversations between org users, residents, and owners, with participant-only visibility.
- Resident messaging depends on active occupancy.
- Owner messaging depends on current accessible unit scope, not generic org membership.
- Building-scoped org messaging is narrower than org-wide messaging and can only target residents in the relevant building.
- Conversation history can reappear once the same user is active in scope again.

Example:
A resident without active occupancy cannot start a management conversation, but once they are actively occupying a unit, the backend can derive eligible management contacts from that building and create the conversation in scope.

#### `broadcasts`

- Owns announcement creation, audience targeting, metadata shaping, and notification fan-out.
- Authority differs by scope:
  - org-scoped users can broadcast across the org
  - building-scoped users can only target accessible buildings
- Recipient resolution can be heavy because it builds a concrete recipient list up front.
- Fan-out is synchronous today.
- Legacy broadcasts without metadata are still normalized into stable metadata responses.

Example:
If a building-scoped manager creates a broadcast without `buildingIds`, the backend defaults to that manager's accessible buildings rather than the whole org.

### F. Front desk, parking, and reporting

#### `visitors`

- Owns visitor creation and lifecycle from both org and resident entry points.
- Resident routes derive building and unit from active occupancy; they do not trust resident-supplied unit context.
- Roommates share the same visitor visibility because visibility is unit-based.
- Residents can cancel expected visitors but cannot set arrival/completion states.
- Arrival on org path emits a resident notification.

Example:
A resident can preregister a guest for their current unit, but only staff can mark that guest as `ARRIVED`, which then triggers an arrival notification to current residents.

#### `parking`

- Owns slot inventory, slot import, allocations, allocation ending, occupancy-bound vehicles, and resident active allocation reads.
- Parking allocation has two different models:
  - occupancy-backed, which requires active occupancy plus active lease
  - unit-backed, which does not require occupancy
- Occupancy-backed allocations and vehicle changes write lease activity; unit-backed ones do not.
- Resident active-allocation read returns the first active allocation found for the resident's latest active occupancy.
- Import supports dry-run and upsert but still runs as in-request processing.

Example:
Allocating two slots to an active occupancy can succeed and write `PARKING_ALLOCATED` lease activity, while allocating to a bare unit without occupancy skips lease activity because it is not tied to live tenancy.

#### `dashboard`

- Owns org overview KPIs, daily trends, and recent activity aggregation.
- Occupancy rate is calculated from active occupancies, not active leases.
- Trend slicing is UTC-based, not building-local-time-based.
- Activity has no pagination and is derived from live source tables rather than immutable event history.
- Same logical record can contribute multiple activity items depending on timestamps and transitions.

Example:
If a building is in a non-UTC timezone, a visitor or maintenance event near local midnight can appear under the previous or next day in dashboard trends because date bucketing is using UTC keys.

## 11. How To Use This Appendix

- Use the top half of this document when explaining platform breadth.
- Use this appendix when someone asks "what are the hidden gotchas?"
- If a discussion turns into implementation design, stop using this brief and open the relevant module review in `modules/*.md`.

## 12. Actor and Scope Matrix

| Actor | Auth model | Runtime scope source | Main surfaces | Common blockers and nuances |
| --- | --- | --- | --- | --- |
| Platform admin | `x-platform-key` or platform-superadmin JWT | explicit platform context, sometimes explicit org override | `/platform/*` | not a normal org user, high-trust path, `orgId` may be `null` |
| Org admin | JWT | DB-backed org scope plus org-scoped RBAC assignments | most `/org/*` routes | broadest org surface, but still subject to permission keys and some module-specific policy checks |
| Org staff | JWT | DB-backed org scope plus org-scoped RBAC assignments | selected `/org/*` routes | can be blocked by missing permission even inside correct org |
| Building admin / manager | JWT | DB-backed org scope plus building-scoped RBAC assignments and building guards | `/org/buildings/:buildingId/*` flows | access is often mixed between explicit permissions and building-assignment semantics |
| Building staff | JWT | DB-backed org scope plus narrower building-scoped assignments | assigned building operations | often limited to assigned items only, especially in maintenance flows |
| Resident | JWT | inferred resident identity plus current org scope; many flows require active occupancy | `/resident/*` | profile access can work without active occupancy, but visitors, messaging, parking, and request intake usually depend on active occupancy |
| Owner | JWT, typically standalone user | active `OwnerAccessGrant` plus active owner and ownership scope | `/owner/*`, `/owner/portfolio/*` | cross-org access is possible, but only through explicit active grants; same-party identity alone is not enough |
| Provider admin | JWT, standalone user | active provider membership plus grant gating rules where grants exist | `/provider/*` profile and staff routes | cannot be ordinary org user; multi-membership context can be ambiguous without explicit selection |
| Provider staff | JWT, standalone user | active provider membership plus provider-specific request scope | `/provider/requests/*` and selected portal reads | assignment and provider-manager rules limit what staff can do; grant rules can still matter when grant rows exist |

## 13. Review-Grade State Machine Summaries

These are simplified operational state summaries derived from the module review set. They are meant to explain behavior, not replace the source code or Prisma enums.

### A. Resident identity and invite lifecycle

- Resident identity is inferred, not stored as one enum.
- Conceptual resident identity:
  - `NEW`
  - `ACTIVE`
  - `FORMER`
- Practical transitions:
  - `NEW -> ACTIVE` when active occupancy exists
  - `ACTIVE -> FORMER` when occupancy history exists but no active occupancy remains
  - `NEW` can still be resident-like before occupancy if profile or invite history exists
- Invite lifecycle is split between DB state and API state:
  - DB states:
    - `SENT`
    - `FAILED`
    - `ACCEPTED`
  - API read states:
    - `PENDING`
    - `EXPIRED`
    - `FAILED`
    - `ACCEPTED`
- Important nuance:
  - `PENDING` vs `EXPIRED` is computed from time, not from a separate persisted enum

### B. Occupancy lifecycle

- Explicit occupancy states:
  - `ACTIVE`
  - `ENDED`
- Practical transitions:
  - create occupancy -> `ACTIVE`
  - move-out or lifecycle end -> `ENDED`
- Important nuance:
  - occupancy can be created from:
    - occupancy API
    - user provisioning lifecycle
    - lease move-in flows
  - occupancy ending can happen outside the occupancies module too

### C. Lease / contract lifecycle

- Explicit `LeaseStatus` values:
  - `DRAFT`
  - `ACTIVE`
  - `ENDED`
  - `CANCELLED`
- Practical transitions:
  - draft contract create -> `DRAFT`
  - activate contract -> `ACTIVE`
  - normal move-out completion -> `ENDED`
  - cancellation path -> `CANCELLED`
- Important nuance:
  - `ACTIVE` contract does not imply active occupancy
  - early move-out can produce raw `CANCELLED` while UI display status maps to `MOVED_OUT`
  - legal contract state and runtime tenant-presence state are related but not identical

### D. Move-request lifecycle

- Explicit `MoveRequestStatus` values:
  - `PENDING`
  - `APPROVED`
  - `REJECTED`
  - `CANCELLED`
  - `COMPLETED`
- Practical transitions:
  - resident creates request -> `PENDING`
  - management review -> `APPROVED` or `REJECTED`
  - execution after approval -> `COMPLETED`
  - administrative or workflow cancellation -> `CANCELLED`
- Important nuance:
  - review and execution are separate steps
  - approved request does not itself complete move-in or move-out until execution runs

### E. Lease access-item lifecycle

- Explicit access-item states:
  - `ISSUED`
  - `RETURNED`
  - `DEACTIVATED`
- Allowed transitions confirmed in the lease review:
  - `ISSUED -> RETURNED`
  - `ISSUED -> DEACTIVATED`
  - `RETURNED -> DEACTIVATED`
- Important nuance:
  - no re-issue path from `DEACTIVATED` is documented in the current review set

### F. Owner access-grant lifecycle

- Explicit `OwnerAccessGrant` states:
  - `PENDING`
  - `ACTIVE`
  - `DISABLED`
- Practical transitions:
  - invite by email -> usually `PENDING`
  - email-match or admin-link existing user -> can start as `ACTIVE`
  - password setup for invited user -> `PENDING -> ACTIVE`
  - disable action -> `ACTIVE -> DISABLED` or `PENDING -> DISABLED`
- Important nuance:
  - only one active representative is allowed per owner
  - all transitions are audited

### G. Provider access-grant lifecycle

- Explicit provider grant states confirmed in the review:
  - `PENDING`
  - `ACTIVE`
  - `DISABLED`
- Practical transitions:
  - provider-admin invite -> `PENDING`
  - password setup for invited user -> `PENDING -> ACTIVE`
  - disable action -> `DISABLED`
- Important nuance:
  - if grant rows exist for a provider, access requires an `ACTIVE` grant
  - if no grant rows exist, membership alone may still permit access

### H. Maintenance request lifecycle

- Explicit request statuses confirmed in the review:
  - `OPEN`
  - `ASSIGNED`
  - `IN_PROGRESS`
  - `COMPLETED`
  - `CANCELED`
- Practical transitions:
  - resident intake -> `OPEN`
  - assign to staff/provider -> `ASSIGNED`
  - start work -> `IN_PROGRESS`
  - finish work -> `COMPLETED`
  - resident cancel before completion -> `CANCELED`
- Important nuance:
  - owner approval and estimate states act as gates on top of status
  - queue names like `NEW`, `READY_TO_ASSIGN`, `AWAITING_OWNER`, and `OVERDUE` are derived workflow views, not the same thing as the primary request status

### I. Maintenance approval and estimate gates

- Conceptual owner-approval sub-state behaves like:
  - no approval requirement
  - `PENDING`
  - `APPROVED`
  - `REJECTED`
- Documented approval transitions:
  - require approval -> `PENDING`
  - request now / request / resend stay within pending approval workflow
  - owner decision or override -> `APPROVED` or `REJECTED`
  - `MANAGEMENT_OVERRIDE` requires deadline expiry
  - `EMERGENCY_OVERRIDE` can directly force approval
- Estimate gate behavior:
  - `estimateStatus = REQUESTED` drives `NEEDS_ESTIMATE` workflow
  - requested estimate blocks execution until submitted

### J. Visitor lifecycle

- The visitor review explicitly confirms:
  - `EXPECTED`
  - `ARRIVED`
  - `CANCELLED`
- The review prose also references completed/departed behavior, but it does not present a full enumerated state table.
- Important nuance:
  - resident routes cannot advance arrival/completion status
  - org routes can change status and trigger arrival notification

### K. Parking allocation lifecycle

- Allocation activity is state-like rather than enum-driven:
  - active allocation = `endDate is null`
  - ended allocation = `endDate is set`
- Practical transitions:
  - create allocation -> active
  - end single allocation or end-all -> ended
- Important nuance:
  - occupancy-backed allocations and unit-backed allocations are parallel models with different validation rules and different side effects

## 14. Source-of-Truth and Fallback Matrix

| Concept | Primary truth | Fallback or secondary truth | Why this matters |
| --- | --- | --- | --- |
| Authenticated org scope | current DB-backed user context from auth validation | JWT `orgId` claim is corrected if stale | client tokens do not get to define final org scope |
| Effective permissions | `RoleTemplate` + `UserAccessAssignment` + `UserPermission` overrides | hidden templates are intentionally excluded from normal evaluation | permission answers are computed, not stored as one flat static list |
| Building access | RBAC v2 scoped assignments plus building guards | `building-assignments` route is compatibility read only | old clients can misread the compatibility surface as canonical |
| Resident identity | inferred from `ResidentProfile`, occupancy history, and invite history | no single resident flag exists | resident-ness is flexible but not cleanly modeled |
| Current resident presence | active `Occupancy` row | none | active contract or lease alone does not prove someone lives there now |
| Current unit vacancy | absence of active `Occupancy` | unit status field is not the authority | availability logic depends on occupancy truth |
| Contract legal view | snapshot fields stored on `Lease` | live joins to owner/resident/building are not authoritative for historical contract presentation | contract is intentionally snapshot-style |
| Current ownership | active `UnitOwnership` row | temporary `Unit.ownerId` fallback during migration | owner and owner-portal behavior can still depend on migration seams |
| Owner runtime access | active `OwnerAccessGrant` + active owner + accessible owned units | ownership fallback may still consult `Unit.ownerId` during migration | same-party identity in another org does not automatically grant access |
| Provider runtime access | active provider membership plus grant rules | membership-only access still works when no provider grant rows exist | provider access is dual-mode and easy to misunderstand |
| Dashboard occupancy rate | active occupancy counts | active lease counts are not the metric used | reporting can differ from what finance/legal teams expect |
| Owner notification scope | active owner grants across orgs | none | owner notifications are cross-org, but grant-derived rather than party-derived |
| Parking eligibility for occupancy allocation | active `Occupancy` plus active `Lease` | unit allocation is a separate non-lease model | the same parking module has two operational truths |

## 15. Side-Effects and Blast-Radius Matrix

| Trigger | Direct writes | Downstream side effects | Operational note |
| --- | --- | --- | --- |
| `POST /auth/forgot-password` | `PasswordResetToken`, sometimes resident invite metadata | email dispatch | request succeeds even when delivery fails; retries are not queue-first |
| `POST /auth/reset-password` | `User.passwordHash`, `refreshTokenHash`, token usage, resident invite acceptance, owner/provider grant activation | notifications and onboarding completion behavior | auth is doing cross-domain completion work here |
| `POST /org/users/provision` | `User`, access assignments, sometimes `Occupancy` | optional invite/reset dispatch after commit | can produce "committed but not onboarded" state |
| unit create or owner change | `Unit`, `UnitAmenity`, `UnitOwnership` sync | affects owner views and ownership history | owner change is not a trivial foreign-key update |
| contract activation | `Lease.status`, `LeaseActivity` | none by itself for occupancy | active contract still does not mean moved in |
| direct move-in or approved move-in execution | `Lease`, `Occupancy`, histories, activities, sometimes resident/profile data | may allocate parking and enable resident operational flows | one operation crosses tenancy, parking, and resident scope |
| direct move-out or occupied-contract cancel | `Occupancy`, `Lease`, parking allocations, access items, histories, activities | resident presence and parking state change together | large blast radius for one call |
| owner invite / link / activate / disable | `OwnerAccessGrant`, `OwnerAccessGrantAudit` | invite email, notifications, portal visibility changes | one policy choice can expose or remove cross-org owner access |
| provider-admin invite / disable | `ServiceProviderAccessGrant`, sometimes standalone `User` | password-reset invite and portal visibility effects | provider ownership shift after activation surprises operators |
| maintenance assignment / status / comment / approval actions | request row, approval audit, comments, read state, attachments | emits events used by notifications and dashboard activity | request module is a workflow engine, not a plain ticket table |
| broadcast create | `Broadcast`, notification rows | realtime and notification fan-out | fan-out is synchronous today |
| notification event handling | `Notification`, `PushDevice` updates when relevant | realtime Socket.IO delivery and optional push delivery | push is synchronous and recipient resolution is central |
| visitor arrival on org path | `Visitor.status` | resident arrival notification | resident path cannot produce the same status transition |
| parking allocate/end/vehicle update on occupancy path | `ParkingAllocation` or `Vehicle`, `LeaseActivity` | affects resident parking views and lease timeline | occupancy-backed and unit-backed parking have different audit shape |
| building delete | `Building` delete | possible cascades into units, occupancies, visitors, parking, and more | impact preview is not first-class in the current surface |

### Auditability snapshot

- Stronger audit posture exists in:
  - lease history and lease activity
  - owner access-grant audit
  - maintenance owner-approval audit
- Weaker audit posture exists in:
  - access-control changes
  - org profile changes
  - building delete impact visibility
  - auth session/device history
- The system has useful eventing and history in several high-risk flows, but audit coverage is not uniform across administrative surfaces.

## 16. Error-Semantics Matrix

These are review-derived behavioral patterns, not a formal global exception contract. The important point is that this backend uses some status codes in deliberately defensive ways rather than in the most naive CRUD sense.

| Outcome | Typical meaning in this backend | Representative examples | Why it matters |
| --- | --- | --- | --- |
| `400 Bad Request` | caller supplied structurally invalid input, mismatched path/body context, mutually exclusive inputs, malformed cursor/token, or invalid business input that is not a scope issue | occupancy create with unit not in building, invalid permission keys, malformed notification cursor, parking request with both or neither target modes, invalid owner-resolution token scope | `400` often means "your request shape or declared relationship is wrong," not "resource missing" |
| `401 Unauthorized` | auth failed before normal permission/scope logic could run | inactive or missing user during auth, invalid resolution token, missing `user.sub` in dashboard auth path | this is mostly reserved for authentication truth problems, not ordinary permission denial |
| `403 Forbidden` | caller is authenticated but lacks required permission or guard-derived authority | missing `org.profile.write`, normal permission failures across `/org/*`, building/user actions blocked by guard logic | this is the expected "you are not allowed" path when the resource is otherwise in visible scope |
| `404 Not Found` | resource is absent, hidden by org/scope isolation, or intentionally masked to avoid leaking existence | cross-org building reads, owner-portfolio request outside scope, hidden role templates treated as missing, wrong-user assignment delete, maintenance cross-org request access, non-pending owner approval actions using defensive `404` | `404` is often an isolation primitive in this backend, not only literal absence |
| `409 Conflict` | uniqueness violation or validly formed request that collides with current state/invariants | duplicate unit label, occupied unit, resident already occupying another unit, duplicate unit type, parking slot already allocated, insufficient available slots, duplicate vehicle plate, duplicate role-template key | `409` is used heavily for operational collisions and business invariants, not just DB uniqueness |
| success with `null` or empty result | caller is valid and in scope, but the meaningful domain object does not currently exist | owner tenant lookup for accessible vacant unit returns `null`, resident parking active allocation can return `null`, assigned-buildings can be empty, dashboard can return zeroed summary for no buildings | not every "nothing here" condition is an error; clients must not over-treat empty state as failure |

### Practical interpretation rules

- Cross-org and out-of-scope behavior often normalizes to `404`, not `403`.
- Permission failures are usually `403` only after auth and scope checks have meaningfully resolved.
- `409` often means "business invariant blocked you" rather than "SQL uniqueness failed."
- Some modules intentionally return success with empty data where less careful APIs might throw, especially for tenant/parking/dashboard convenience reads.

## 17. Test-Coverage Heatmap

This is not code coverage. It is review confidence based on what the module review set explicitly says is tested.

### A. High confidence

These modules have direct coverage over their core behavior, and the review docs point to multiple meaningful cases rather than one smoke test.

| Module group | Coverage signal | Why confidence is high |
| --- | --- | --- |
| `auth` | unit coverage plus broad notable cases | login/refresh/reset, invite failure handling, owner/provider activation side effects, stale-org correction |
| `access-control` | unit coverage plus dense notable cases | permission computation, overrides, hidden template behavior, projection/persona cases |
| `residents` | multiple integration suites | onboarding, invite flows, directory/list behavior, profile read/write, self-service, cross-org isolation |
| `leases` | several focused e2e suites plus service specs | contracts RBAC, move-in/out, documents, access items, occupants, timeline/history, resident views |
| `maintenance-requests` | integration coverage over core workflow | resident intake, staff/provider actions, approval lifecycle, unread counts, routing behavior |
| `owners` and `owner-portfolio` | unit/integration coverage across both provisioning and runtime access | party resolution, grant lifecycle, reassignment, cross-org isolation, approvals |
| `service-providers` | integration plus unit coverage | cross-org linking, invite activation, admin ownership shift, portal staff management |
| `notifications` | integration plus unit coverage | realtime delivery, owner cross-org scope, push registration, resolver behavior |
| `units` | integration coverage over major flows | create/update/import, ownership sync effects, occupancy-aware reads |
| `parking` | integration coverage over major flows | import, allocation, lease-backed behavior, vehicles, resident allocation view |

### B. Medium confidence

These modules have direct tests or strong indirect coverage, but the surface area is either smaller or the tests are narrower than the domain complexity.

| Module group | Coverage signal | Why confidence is medium |
| --- | --- | --- |
| `users` | unit coverage plus important integration through adjacent flows | provisioning engine and self-service behaviors are covered, but much of the confidence comes through resident/platform/profile flows |
| `occupancies` | direct constraint spec plus important indirect integration | core invariants are exercised well, but lifecycle ownership is shared across modules |
| `messaging` | integration plus unit coverage | main actor flows are covered, but policy subtleties still live in a dense service |
| `buildings` | integration coverage | CRUD and isolation are covered, but downstream delete blast radius is not the same as endpoint coverage |
| `visitors` | integration coverage | org/resident split is tested, but the state model is still small and lightly audited |
| `dashboard` | service-level direct coverage | aggregation logic is tested, but no broad end-to-end reporting contract is claimed |
| `parties` | unit plus integration coverage | normalization, masking, and token flow are tested, but long-term rotation strategy is still undocumented rather than test-proven |
| `unit-ownerships` | unit plus integration coverage | migration seam and single-active-owner behavior are covered, but it remains a support module trusting callers |
| `org-profile` | integration coverage | read/write and isolation are covered, but audit/versioning gaps are product concerns rather than test gaps |
| `platform` | one focused integration suite | bootstrap path is tested, but the module is still high-trust and small enough that observability questions remain outside test scope |

### C. Light or narrow confidence

These modules are covered, but the coverage is either indirect, narrow, or centered on one slice of behavior rather than the full operational surface.

| Module group | Coverage signal | Why confidence is lighter |
| --- | --- | --- |
| `broadcasts` | unit coverage only in the review notes | authority and metadata behavior are covered, but fan-out/performance/runtime delivery concerns are not the same as workflow confidence |
| `building-amenities` | one integration suite | default semantics are tested, but this is still a small module whose downstream effects mostly show up through unit flows |
| `building-assignments` | service spec plus related access integration | compatibility mapping is covered, but this is a migration seam rather than a deeply tested domain |
| `unit-types` | indirect coverage through unit flows | enough to trust basic integration, not enough to claim rich standalone lifecycle confidence |

### D. Explicit gap

| Module | Coverage signal | Practical meaning |
| --- | --- | --- |
| `health` | no dedicated tests claimed in the review | safe enough because the surface is tiny, but the response contract is still not locked by a dedicated test |

### How to read the heatmap

- High confidence does not mean low complexity. In this backend it often means the team already needed tests because the module is complicated and risky.
- Medium confidence often means the core behavior is believable, but some side effects or scale concerns are not really "solved by tests."
- Light confidence does not automatically mean dangerous; several of these modules are intentionally small.
- The biggest risk areas are the places where complexity and side effects are both high:
  - leases
  - maintenance requests
  - owner/provider access
  - notifications
  - provisioning/auth orchestration

## 18. Compatibility and Deprecation Inventory

This section is the migration-seam inventory. Some items are explicit compatibility layers. Others are temporary fallbacks that should not quietly become permanent architecture.

| Seam or compatibility surface | Current behavior | Why it still exists | Risk if it lingers | Desired end-state |
| --- | --- | --- | --- | --- |
| `/roles` alongside `/role-templates` | access-control supports both route families through shared services | older clients still expect legacy roles vocabulary | docs drift, frontend confusion, duplicate mental models, longer-term test burden | one canonical `/role-templates` model with formal deprecation of `/roles` |
| hidden / older role shapes | older hidden role-template shapes are filtered out from ordinary responses unless explicitly requested | internal or older consumers still rely on them indirectly | security and visibility rules become harder to reason about | visible role-template model only, with old shapes removed or isolated |
| `building-assignments` compatibility route | `GET /org/buildings/:buildingId/assignments` returns legacy-friendly assignment `type` data mapped from the newer access model | older clients still expect assignment-style building access reads | teams mistake compatibility read model for source of truth | consumers move to RBAC v2 access-assignment reads and this route gets deprecated |
| older mental model for `GET /org/buildings/assigned` | route is powered by RBAC v2 access assignments, not old `BuildingAssignment` rows | naming still invites legacy assumptions | frontend or ops teams make wrong assumptions about who should appear | document and treat it as RBAC v2 personal-scope building list only |
| `contracts.*` and `leases.*` permission aliasing | lease module aliases contract and lease permissions in both directions | naming transition and compatibility baggage | permissions become harder to audit and explain, and future policy changes get messy | pick one canonical permission namespace and retire the alias layer |
| contract vs lease naming overlap | one module/entity still carries both legal contract and runtime lease semantics | product evolved faster than the domain vocabulary | reviewers and API consumers misread `ACTIVE` as moved-in truth | clearer domain split or at least one canonical naming/storyline |
| `Unit.ownerId` fallback reads | owner-portfolio and ownership flows can still fall back to `Unit.ownerId` when no active `UnitOwnership` row exists | ownership model migration is not fully complete | migration seam becomes permanent and inconsistent states persist | active `UnitOwnership` is the only ownership truth |
| dual-write between `Unit.ownerId` and `UnitOwnership` | ownership sync keeps pointer and history aligned during migration | supports old reads while new ownership model rolls out | callers may trust the pointer too long instead of the history table | retire pointer fallback and reduce the dual-write seam |
| legacy broadcast metadata fallback | broadcasts without new metadata still return inferred metadata on read | older broadcast rows exist without full metadata | reporting semantics remain partly inferred rather than explicit | all broadcasts store canonical metadata at write time |
| owner/provider onboarding through auth reset completion | auth reset-password completes downstream owner/provider onboarding transitions | convenient shared onboarding path | auth becomes the long-term home for cross-domain orchestration by accident | onboarding completion logic becomes more explicitly owned or documented as intentional |
| occupancy lifecycle spread across modules | occupancy can be created or ended by occupancies, users lifecycle, and lease lifecycle flows | product workflows grew through multiple entry points | lifecycle reasoning is fragmented and harder to document/test | one clearer lifecycle boundary or one documented canonical mutation path |
| occupancy-backed vs unit-backed parking allocations | parking supports both allocation models and even asks whether one should be deprecated | product supports both tenant and non-tenant parking use cases | reporting, audit, and UX become inconsistent between the two paths | document one canonical use case for each path or deprecate one if it turns out unnecessary |

### Practical reading rule

- Compatibility layer means "publicly visible old/new interface overlap."
- Migration seam means "temporary internal fallback or dual-write that should eventually disappear."
- Both matter because they increase operational complexity even when the feature still works.

## 19. PII and Sensitive-Data Map

This is not a legal data-classification policy. It is a technical map of where the backend clearly handles personal, legal, business-sensitive, or secret-bearing data.

| Data area | Example fields or content | Main surfaces | Protection or limiting behavior documented in the review set | Main risk |
| --- | --- | --- | --- | --- |
| Auth secrets and session-sensitive data | `passwordHash`, `refreshTokenHash`, reset-token hashes, invite/reset tokens | `auth` internals, password reset lifecycle | tokens are hashed for storage, reset tokens are single-use, refresh hash is rotated and cleared on logout/reset | weak session model is still single-slot per user, not per device/session |
| Core user identity and contact data | name, email, phone, avatar URL | `users`, `auth`, shared user payloads | org scoping, permission gating, self-profile routes distinct from admin routes | enriched user payloads can become heavy and broad if consumers overuse them |
| Resident profile data | Emirates ID number, passport number, nationality, date of birth, current address, emergency contact name/phone, preferred building | `residents` profile routes, resident directory/profile reads | separate resident profile permissions, self-profile permissions, avatar MIME/type checks | resident identity is inferred broadly, and profile writes can affect classification |
| Occupancy-expanded PII | resident email and optional embedded profile details when `includeProfile=true` | `occupancies` list/read surfaces | `includeProfile=true` is an explicit query expansion and the review calls out the larger PII surface | a query flag can silently expand operational reads into much more sensitive data |
| Owner strong identifiers | Emirates ID / passport / trade-license style identifiers, `last4`, masked identifier summaries | `parties`, `owners` | raw identifiers never leave service boundary, stored encrypted, lookup via HMAC, masked output only, audit stores HMAC not raw input | key rotation and normalization-version strategy are not yet defined |
| Owner and owner-contact data | owner name, email, phone, address, notes, owner-profile contact overrides | `owners`, `owner-portfolio` | org scoping for registry, grant-based scope for owner portal, masked identifier output | cross-org linking by email is powerful and must remain policy-driven |
| Lease / contract legal snapshot data | owner and landlord names, tenant name/email/phone, building/property labels, contract value and legal metadata | `leases`, resident contract views, org contract views | contract snapshot is intentional, some legal fields lock after activation with `ijariId` | legal/business snapshot data is broad and long-lived inside one core entity |
| Lease documents and storage-backed URLs | lease documents, signed storage-backed URLs, access-card and parking-sticker artifacts | `leases` asset submodules | storage-backed `storage://...` URLs are resolved into signed URLs at read time | returned document URLs are not stable identifiers and documents may carry sensitive tenancy/legal content |
| Maintenance request context | requester context, tenancy context, owner-approval data, comments, attachments | `maintenance-requests`, `owner-portfolio` | role-specific views, `SHARED` vs `INTERNAL` visibility, per-scope unread tracking, audit for owner approval | attachments and comments can contain free-form sensitive data beyond schema-level fields |
| Private message content | subjects, message content, participant lists, read timestamps | `messaging` | participant-only visibility, org/building scope rules, owner/resident scope checks | message bodies are user-generated free text and are not reducible to a safe fixed schema |
| Notification and push-device data | notification title/body/data, push token, app/device IDs, platform/provider metadata | `notifications` | org or owner-scope gating, provider-aware token validation, owner push targets filtered by active grants | push tokens and message bodies are sensitive operational data, and push still runs synchronously |
| Visitor identity data | visitor name, phone number, type, expected arrival, unit linkage | `visitors` | resident routes derive unit/building from active occupancy, roommate visibility limited to same unit, staff-only arrival state changes | visitor PII has little explicit audit/retention guidance in the current review set |
| Vehicle identity data | vehicle plate number, label | `parking` | org-scoped write paths, occupancy/lease checks for occupancy-backed vehicle flows | plate uniqueness scope is unclear and may be broader than intended |
| Org business-sensitive data | business name, trade-license number, VAT registration number, registered office address, business email, office phone, owner name, logo URL | `org-profile` | partial-update validation, HTTPS-only `logoUrl`, `org.profile.write` required for writes | sensitive business fields are not explicitly audited today |

### Sensitive-data observations worth keeping

- The cleanest privacy posture in the backend is in `parties`, where raw identifiers never leave the service boundary and storage is intentionally encrypted and masked.
- The least obvious PII expansion is `occupancies?includeProfile=true`, because it looks like an operational list endpoint until the profile flag is added.
- The broadest free-form sensitive-data surfaces are:
  - maintenance comments and attachments
  - private messages
  - lease documents
- Business-sensitive data matters too, not just personal data. `org-profile` and contract snapshot fields can affect legal and financial workflows even when they are not classic consumer PII.

## 20. Top Operational Failure Scenarios

These are not theoretical. They are the kinds of failures or degraded behaviors the review set already hints at.

| Scenario | Where it happens | Current behavior | Why it hurts | Best hardening move |
| --- | --- | --- | --- | --- |
| user was created but invite never really reached them | `users`, `auth`, `residents`, owner/provider invite flows | DB transaction commits, then invite delivery fails after commit or email send fails while API still reports success | support and admins see "user exists" but onboarding did not actually complete | queue-backed invite delivery plus visible delivery status and retry tooling |
| reset token exists but reset email was not delivered | `auth` | token row can exist even when email send fails | hidden dead-end for user without clear retry visibility | queue-backed reset delivery and admin metrics for failed sends |
| logging in on one device silently invalidates another | `auth` | single refresh-token slot per user; new login overwrites old refresh state | users perceive random logout or broken sessions across devices | per-session refresh token table and session management |
| contract is active but tenant is not actually moved in | `leases` | `LeaseStatus.ACTIVE` can exist with `occupancyId = null` | frontend or ops teams misread contract state as current residency | explicit state-machine docs and stricter UI/API language around activation vs move-in |
| two move-in paths drift apart over time | `leases`, `occupancies`, `users` | direct move-in and request/approve/execute path do not share one single orchestration path | rule changes can land in one path and not the other | consolidate execution rules or at least publish one canonical lifecycle matrix |
| ownership appears correct in one place and wrong in another | `units`, `unit-ownerships`, `owner-portfolio` | migration fallback still allows `Unit.ownerId` to matter when active ownership rows are missing | pointer/history mismatch becomes a long-tail source of portal bugs | finish the ownership migration and remove fallback reads |
| provider user cannot access the portal even though they look assigned | `service-providers` | memberships can exist, but once grant rows exist they must be `ACTIVE`; multi-membership context can also conflict | support and frontend logic misread membership as sufficient | explicit provider-selection flow and clearer grant-status surfacing |
| request queue or dashboard behavior slows down at larger org size | `maintenance-requests`, `dashboard`, `notifications` | in-memory queue filtering, no dashboard activity pagination, owner scope recomputation, synchronous push | operational latency rises before anything technically "breaks" | pagination, caching with invalidation, async push, and query narrowing |
| broadcast or notification create path gets slow under fan-out | `broadcasts`, `notifications` | fan-out and push delivery still happen synchronously | high recipient count turns create latency into an ops problem | move fan-out and push to queue-backed workers |
| building delete removes more than the caller realized | `buildings` and downstream relations | delete route is simple and org-scoped, but impact preview is not first-class | one admin action can destroy broad operational history or live relations | pre-delete impact endpoint and stronger delete policy |
| dashboard trends look "wrong" around day boundaries | `dashboard` | UTC bucketing can shift local-day events | business users distrust reporting even when raw data is fine | org-local or building-local trend bucketing |
| resident, owner, or parking read returns empty/null and client treats it as a bug | `residents`, `owner-portfolio`, `parking`, `dashboard` | some routes intentionally return `null`, empty lists, or zeroed summaries | clients mis-handle legitimate empty state as failure | document empty-state semantics explicitly in contracts and clients |
| destructive replace call wipes more than the caller intended | `leases`, `units` | replace semantics exist for occupants, additional terms, and some amenity-link behavior | callers expect patch semantics and accidentally remove data | stronger API docs, diff/preview support, or versioned replace semantics |
| PII exposure grows because someone adds one query flag | `occupancies`, `residents` | `includeProfile=true` expands occupancy reads into profile data | operational list endpoint becomes sensitive without obvious UI change | stricter role review and explicit frontend gating for profile-expanded reads |

## 21. Silent vs Loud Failure Patterns

This backend does not fail in one uniform style. Some failures are loud and obvious. Others are intentionally quiet or operationally ambiguous.

### Loud failures

These are the behaviors that should usually be visible quickly in logs, tests, or client errors.

| Pattern | Examples | Why it is loud |
| --- | --- | --- |
| hard business invariant conflicts | occupied unit, resident already occupying another unit, duplicate unit label, duplicate unit type, parking slot already allocated, duplicate vehicle plate | caller gets `409` and the action stops |
| explicit auth or permission rejection | inactive user at login, missing permission, invalid owner-resolution token | caller gets `401` or `403` |
| defensive scope isolation | cross-org building/request/owner access | caller gets `404` or empty scoped result |
| malformed request structure | bad cursor, invalid permission key, wrong path/body relationship, mutually exclusive request shape | caller gets `400` |

### Quiet or semi-silent failures

These are the ones that cause support pain because the backend may technically "succeed" while the business outcome is degraded.

| Pattern | Examples | Why it is quiet |
| --- | --- | --- |
| API success despite delivery failure | forgot-password on unknown email, invite email failure after commit, reset token created but email send failed | HTTP success does not guarantee the user actually received anything |
| valid empty state that clients may misread | `/resident/me` with `occupancy = null`, owner tenant lookup returns `null`, resident active parking allocation returns `null`, assigned buildings empty, dashboard zeroed summary with no buildings | nothing is broken, but naive clients may think it is |
| computed status that changes without row mutation | resident invite `PENDING` vs `EXPIRED`, some display status behavior on leases | the API can "change state" over time even when the stored row did not change |
| fallback-driven behavior | ownership fallback to `Unit.ownerId`, legacy broadcast metadata fallback | system still works, but on a temporary or inferred truth source |
| performance degradation before outright failure | synchronous push, synchronous broadcast fan-out, owner scope recomputation, in-memory queue filtering | requests still work, just worse and worse under scale |
| asymmetric behavior across similar flows | CSV create vs CSV upsert semantics in units, occupancy-backed vs unit-backed parking, direct move-in vs reviewed move-in | one path behaves differently enough to surprise operators or frontend teams |

### Reading rule

- Loud failures are easier to debug and usually healthier than quiet failure when the business action truly did not happen.
- Quiet failure is sometimes intentional for security or UX reasons, but it must be backed by observability or it turns into support debt.

## 22. Hardening Priorities by Module Group

This is the practical engineering-priority table. It is biased toward leverage, not toward elegance.

If someone needs the execution version instead of this summary table, use `docs/BACKEND-HARDENING-ROADMAP.md`.

| Module group | Main hardening priority | Why it is first-order important | Typical effort shape |
| --- | --- | --- | --- |
| `auth` | session model and queue-backed invite/reset delivery | current single-refresh-token model and request-path email delivery are operational weak points | medium-to-large |
| `access-control` | audit trail plus formal deprecation of compatibility role routes | this is security-sensitive infrastructure with vocabulary and compatibility drift | medium |
| `users` and `residents` | provisioning observability and clearer resident-state modeling | onboarding already crosses identity, occupancy, and invite logic, and some failures are semi-silent | medium |
| `leases` | explicit state machine and consolidation of move execution rules | lease/contract semantics and dual move paths are one of the biggest reasoning risks in the codebase | large |
| `owners`, `owner-portfolio`, `unit-ownerships` | finish ownership migration and tighten owner identity/runtime access story | fallback ownership truth is still live and owner access is cross-org sensitive | medium-to-large |
| `service-providers` | explicit provider-selection flow and clearer grant-state surfacing | multi-membership ambiguity and dual-mode access rules are support traps | medium |
| `maintenance-requests` | split policy/execution concerns and remove in-memory queue dependence | one dense workflow service already carries too much orchestration and heuristic routing | large |
| `notifications` and `broadcasts` | queue-backed push and fan-out, plus delivery observability | current synchronous delivery paths are clear scale and latency risks | medium |
| `dashboard` | pagination/caching and timezone-correct trends | reporting trust erodes quickly when time buckets drift or feeds truncate badly | medium |
| `buildings` | delete guardrails and impact preview | simple API surface hides broad destructive potential | small-to-medium |
| `parking` | clarify dual allocation model and resident allocation semantics | the module currently supports two truths with different audit/reporting side effects | medium |
| `org-profile` and `health` | audit/business-field review plus readiness endpoint | small modules, but both matter operationally more than their code size suggests | small |

### Suggested execution order

If the goal is risk reduction rather than feature growth, the highest-leverage order is:

1. `auth`, `notifications`, `broadcasts`
2. `leases`, `maintenance-requests`
3. `owners`, `owner-portfolio`, `unit-ownerships`, `service-providers`
4. `access-control`, `users`, `residents`
5. `dashboard`, `buildings`, `parking`, `org-profile`, `health`

### Why this order

- First fix the places where failures are operationally expensive and already partly synchronous.
- Then fix the places where state drift and workflow complexity create change risk.
- Then finish the migration seams and access-model ambiguities.
- Then tighten the supporting admin/reporting surfaces.
