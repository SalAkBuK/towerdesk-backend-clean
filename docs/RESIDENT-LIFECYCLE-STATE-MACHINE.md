# Resident Lifecycle State Machine

This document explains the resident domain as a lifecycle rather than as a loose set of CRUD endpoints.

It is based on:

- `modules/residents.md`
- `modules/occupancies.md`
- `modules/users.md`
- `modules/auth.md`

## 1. Why This Needs Its Own Document

"Resident" is not stored as one simple enum in this backend.

Resident-ness is inferred from multiple signals:

- resident profile presence
- occupancy history
- invite history

That gives the product flexibility, but it also means teams can easily over-assume what "resident" means in different routes.

## 2. State Dimensions

There are really four related but different dimensions.

### A. Resident identity state

This is conceptual, not a persisted enum.

- `NEW`
  - user has never had occupancy
- `ACTIVE`
  - user has at least one active occupancy
- `FORMER`
  - user has occupancy history but no active occupancy

### B. Invite state

Database status:

- `SENT`
- `FAILED`
- `ACCEPTED`

API list status:

- `PENDING`
- `EXPIRED`
- `FAILED`
- `ACCEPTED`

Important note:

- `PENDING` vs `EXPIRED` is computed from `expiresAt`
- the same DB row can change API status over time without the stored status changing from `SENT`

### C. Profile state

- no resident profile
- resident profile attached

Important note:

- attaching a resident profile is not just profile maintenance
- it is one of the signals that makes a user appear resident-like

### D. Occupancy state

- no occupancy
- active occupancy
- occupancy history only

This is what drives many real operational permissions.

## 3. Canonical Resident Lifecycle States

### 1. Invited / pre-move-in resident-like user

- may have resident invite history
- may have resident profile
- has no active occupancy
- often appears as `NEW`

### 2. Resident account without occupancy

- created org-side through `POST /org/residents`
- may have profile
- may have preferred building
- still not actually living in a unit

### 3. Active resident

- has active occupancy
- appears as `ACTIVE`
- can participate in most operational resident flows

### 4. Former resident

- has occupancy history
- no longer has active occupancy
- still may exist as a resident-like user in the system

### 5. Resident with failed or expired invite

- identity row exists
- onboarding email may have failed or invite may have expired
- support may need resend or recovery flow

## 4. Main Transitions

| From | Action | To | Important side effects |
| --- | --- | --- | --- |
| no resident-like presence | org resident create | resident account without occupancy | user created or linked, optional profile upsert, no occupancy created |
| no resident-like presence | building onboarding | active resident | provisioning runs through lifecycle service and can create occupancy immediately |
| resident account without occupancy | building onboarding / move-in provisioning | active resident | occupancy created through lifecycle path |
| active resident | move-out | former resident | active occupancy ends |
| former resident | new move-in | active resident | occupancy becomes active again |
| resident invite pending | invite accepted via password setup | invited or pre-move-in user becomes accepted account state | invite marked accepted, auth onboarding completes |
| resident invite pending | resend too soon | same state | conflict/cooldown behavior, no transition |
| resident invite pending | time passes beyond expiry | API view becomes expired | DB row may still remain `SENT` |

## 5. Entry Points Into The Lifecycle

### A. Building-scoped onboarding

- route: `POST /org/buildings/:buildingId/residents`
- building and unit are validated together
- real provisioning work is delegated to `OrgUserLifecycleService`
- this path can create occupancy immediately

### B. Org-scoped resident create

- route: `POST /org/residents`
- creates account and optional profile only
- no occupancy is created automatically

### C. Profile attach or update

- org admin profile routes and resident self-profile routes can attach or change resident profile data
- this can change how the system classifies a user in resident flows

### D. Invite resend

- resend uses auth password-reset style infrastructure with `RESIDENT_INVITE`
- cooldown rules can block immediate retry

## 6. What Actually Gates Resident Features

Not all resident routes mean the same thing.

### Routes that can work without active occupancy

- some resident identity or self-profile reads
- `/resident/me` can return the user with `occupancy = null`

### Routes that usually require active occupancy

- visitor creation and most visitor reads
- resident messaging flows
- maintenance request intake
- resident parking active allocation

This is why "resident user exists" is not enough to infer "resident can do all resident things."

## 7. Read-Model Differences That Cause Confusion

### Building resident list

- simpler operational surface
- based on occupancy rows
- can append unassigned users when:
  - no active occupancy
  - `preferredBuildingId` matches

### Resident directory

- richer surface
- cursor pagination
- search and sorting
- contract-aware flags

They are not interchangeable APIs.

## 8. High-Risk Nuances

### Resident identity is inferred

This is flexible, but it weakens clarity.

### Building write access is mixed-model

Tests already show that some resident onboarding authority depends on assignment logic as well as permission keys:

- managers can write via assignment logic
- building admins can write without explicit permission
- staff cannot

### `includeUnassigned` is profile-driven

Unassigned residents show up only when `preferredBuildingId` supports it. Invite history alone is not enough.

### Invite state is time-sensitive

API status can change from pending to expired without the DB row changing.

### Profile write can affect classification

Because profile presence is one of the resident-like signals, profile upsert is not a pure cosmetic update.

## 9. Failure Modes To Keep In Mind

- building onboarding rejects unit/building mismatch
- occupied unit conflicts block onboarding
- recently failed invite can still be stuck behind resend cooldown
- storage problems can break avatar upload while resident identity remains fine
- `/resident/me` returning `occupancy = null` is legitimate and must not be treated as a backend failure

## 10. Recommended Hardening Moves

- decide whether resident should remain inferred or become an explicit domain state
- publish one lifecycle diagram linking:
  - invite
  - profile
  - occupancy
  - lease
  - move-out
- make frontend and ops teams treat building resident list and resident directory as separate products
- improve invite delivery observability and retry behavior
