# Residents Review

## Scope

- Source: `src/modules/residents`
- Main files:
  - `residents.controller.ts`
  - `org-residents.controller.ts`
  - `resident-directory.controller.ts`
  - `resident-profiles.controller.ts`
  - `resident-profile.controller.ts`
  - `residents.service.ts`
  - `resident-profiles.service.ts`
  - `resident-profiles.repo.ts`
- Public routes span:
  - `POST /org/buildings/:buildingId/residents`
  - `GET /org/buildings/:buildingId/residents`
  - `GET /org/buildings/:buildingId/resident-directory`
  - `POST /org/residents`
  - `GET /org/residents`
  - `POST /org/residents/:userId/send-invite`
  - `GET /org/residents/invites`
  - `GET /org/residents/:userId/profile`
  - `PUT /org/residents/:userId/profile`
  - `GET /org/me/resident-profile`
  - `GET /resident/me`
  - `PUT /resident/me/profile`
  - `POST /resident/me/avatar`
- Core responsibility: resident onboarding, resident classification, invite handling, directory/list views, and resident profile self-service/admin-service operations.

## What This Module Really Owns

- Building-scoped resident onboarding into a specific unit.
- Org-scoped resident account creation without immediate occupancy.
- Resident invite resend and invite history listing.
- Two different resident read models:
  - building resident list
  - building resident directory
- Resident profile CRUD for admins and residents.
- Resident self-service identity surface at `/resident/me`.

## Important Architectural Note

This is not one simple feature module.

It is effectively five surfaces grouped together:

- building operations
- org-admin resident registry
- resident invite management
- resident profile administration
- resident self-service

That makes the module useful, but cognitively dense.

It also means resident lifecycle is distributed across:

- `residents`
- `users/org-user-lifecycle.service.ts`
- `occupancies`
- `auth`
- `leases`

So when reviewing this module, treat it as a lifecycle coordinator, not just a CRUD controller set.

## How The System Decides Who Counts As A Resident

This module does not rely on a single explicit resident flag.

A user is treated as resident-like if they have one or more of:

- a `ResidentProfile`
- any occupancy history
- any resident invite history

This matters because multiple endpoints use those signals to decide whether a user belongs in resident workflows.

That design is flexible, but it also means resident identity is inferred from data shape rather than from one explicit status field.

## Step-By-Step Request Flows

### 1. Building-scoped resident onboarding

Route: `POST /org/buildings/:buildingId/residents`

1. Controller applies `JwtAuthGuard`, `OrgScopeGuard`, and `BuildingAccessGuard`.
2. Route requires:
   - `@BuildingWriteAccess(true)`
   - `@RequirePermissions('residents.write')`
3. Service verifies the building belongs to the caller's org.
4. Service verifies the requested unit belongs to that building.
5. `sendInvite` defaults to `true` unless explicitly set to `false`.
6. Service delegates the real user creation/linking logic to `OrgUserLifecycleService.provisionOrgUser(...)`.
7. Provisioning request includes:
   - identity data
   - resident grant with `buildingId`, `unitId`, and mode `ADD`
   - `ifEmailExists = ERROR`
   - `requireSameOrg = true`
   - `ensureResidentBaselinePermissions = true`
8. Occupancy creation is therefore not implemented directly here; it happens through the lifecycle service.
9. Response returns:
   - user identity summary
   - assigned unit
   - generated temp password if one was created
   - `inviteSent`
   - `mustChangePassword`

### 2. Building resident list

Route: `GET /org/buildings/:buildingId/residents`

1. Same building guards apply.
2. Route requires building-read access plus `residents.read`.
3. Service verifies building scope.
4. Service loads occupancy rows for the building:
   - default `status = ACTIVE`
   - optional `ENDED`
   - optional `ALL`
5. Each occupancy row is mapped to a flat resident list item.
6. If `includeUnassigned=true`, service performs an extra query for org users who:
   - have no active occupancy
   - have a resident profile whose `preferredBuildingId` equals the building
7. Those extra rows are appended with `status = NO_OCCUPANCY`.

### 3. Org-side resident account creation

Route: `POST /org/residents`

1. Controller uses `JwtAuthGuard`, `OrgScopeGuard`, and `PermissionsGuard`.
2. Route requires `residents.write`.
3. Service validates `profile.preferredBuildingId` if provided.
4. Service calls `OrgUserLifecycleService.provisionOrgUser(...)`.
5. In this route, no resident occupancy is created automatically.
6. If a profile payload exists, service upserts a `ResidentProfile`.
7. Response includes:
   - projected user
   - resident profile if present
   - temp password if generated
   - `inviteSent`

### 4. Resend resident invite

Route: `POST /org/residents/:userId/send-invite`

1. Route requires `residents.write`.
2. Service verifies the target user is in the same org and looks resident-like using the inferred resident rules:
   - has profile
   - or has occupancies
   - or has resident invites
3. Service checks resend cooldown using `RESIDENT_INVITE_RESEND_COOLDOWN_SECONDS`.
4. Cooldown is based on the latest invite `sentAt`.
5. If resend is too soon, service throws conflict with retry-after wording.
6. Otherwise service delegates to `AuthService.requestPasswordReset(...)` with purpose `RESIDENT_INVITE`.
7. Response is `{ success: true }`.

### 5. Org resident list

Route: `GET /org/residents`

1. Route requires `residents.read`.
2. Service builds an org-scoped user query.
3. Resident list supports filters:
   - `ALL`
   - `WITH_OCCUPANCY`
   - `WITHOUT_OCCUPANCY`
   - `NEW`
   - `FORMER`
4. `includeProfile=true` includes resident profile data.
5. Cursor pagination is based on `(createdAt, id)`.
6. Each returned user is projected through `OrgUserLifecycleService.buildUserResponse(...)`.
7. Service derives resident status:
   - `ACTIVE` if any active occupancy exists
   - `NEW` if no occupancy exists at all
   - `FORMER` if occupancy history exists but no active occupancy remains
8. For former residents, service also derives the most recent ended occupancy summary.

### 6. Org invite list

Route: `GET /org/residents/invites`

1. Route requires `residents.read`.
2. Service lists `ResidentInvite` rows for the current org.
3. Status filter is semantic rather than raw DB-only:
   - `PENDING` = `SENT` and not expired
   - `EXPIRED` = `SENT` and expired
   - `ACCEPTED`
   - `FAILED`
4. Search is by invited user's name or email.
5. Cursor pagination is based on `(sentAt, id)`.
6. Response includes invite metadata plus user and inviter summaries.

### 7. Building resident directory

Route: `GET /org/buildings/:buildingId/resident-directory`

1. Controller uses `JwtAuthGuard`, `OrgScopeGuard`, `PermissionsGuard`, and `BuildingAccessGuard`.
2. Route requires building-read access plus `residents.read`.
3. Service verifies the building exists in the current org.
4. Directory query reads from `Occupancy`, not from `User`.
5. Search supports:
   - resident name
   - resident email
   - unit label
6. Sort supports:
   - `createdAt`
   - `startAt`
   - `residentName`
   - `unitLabel`
7. Cursor pagination is keyset-based.
8. Query can optionally include profile data from `residentProfile`.
9. Query also includes the linked lease when present.
10. Service derives additional contract-related flags for each row:
    - `latestContractId`
    - `canViewContract`
    - `canRequestMoveOut`
    - `canExecuteMoveOut`
11. Output is operationally richer than the simpler building resident list.

### 8. Org-side resident profile admin

Routes:

- `GET /org/residents/:userId/profile`
- `PUT /org/residents/:userId/profile`
- `GET /org/me/resident-profile`

1. Controller uses `JwtAuthGuard`, `OrgScopeGuard`, and `PermissionsGuard`.
2. Reads require `residents.profile.read`.
3. Writes require `residents.profile.write`.
4. Service verifies target user is in the same org.
5. For upsert, `preferredBuildingId` is validated against the same org.
6. Upsert uses `ResidentProfilesRepo.upsertByUserId(...)`.
7. Response always includes embedded user identity summary.

### 9. Resident self-service

Routes:

- `GET /resident/me`
- `PUT /resident/me/profile`
- `POST /resident/me/avatar`

`GET /resident/me`

1. Requires `resident.profile.read`.
2. Service verifies current user is in the current org.
3. Service loads the latest active occupancy for the resident, if any.
4. Response returns user identity plus occupancy summary.

`PUT /resident/me/profile`

1. Requires `resident.profile.write`.
2. Delegates to `ResidentProfilesService.upsertMyProfile(...)`.
3. Same profile validation rules apply as org-admin upsert.

`POST /resident/me/avatar`

1. Requires `resident.profile.write`.
2. Multipart upload is enforced with a 5 MB interceptor limit.
3. Service also validates:
   - file existence
   - MIME type
   - final file size
4. Allowed avatar MIME types:
   - `image/jpeg`
   - `image/jpg`
   - `image/png`
   - `image/webp`
5. File is written through `StorageService`.
6. User row `avatarUrl` is updated.
7. Response returns the public avatar URL.

## Data And State Model

### Main tables touched

- `User`
- `ResidentProfile`
- `ResidentInvite`
- `Occupancy`
- `Lease`

### Resident profile fields

- identity-linked fields
  - `userId`
  - `orgId`
- resident detail fields
  - `emiratesIdNumber`
  - `passportNumber`
  - `nationality`
  - `dateOfBirth`
  - `currentAddress`
  - `emergencyContactName`
  - `emergencyContactPhone`
  - `preferredBuildingId`

### Important conceptual states

Resident state is inferred, not stored as one enum.

- `ACTIVE`
  - user has at least one active occupancy
- `NEW`
  - user has never had occupancy
- `FORMER`
  - user has occupancy history, but no active occupancy

Invite state is also partly semantic.

- database status:
  - `SENT`
  - `FAILED`
  - `ACCEPTED`
- API list status:
  - `PENDING`
  - `EXPIRED`
  - `FAILED`
  - `ACCEPTED`

## Access Model

### Building onboarding and building resident list

- Requires building-scoped access behavior plus resident permissions.
- Tests show write access is not purely permission-based:
  - managers can write via assignment logic
  - building admins can write without explicit permission
  - staff cannot

This is one of the places where the access model is deliberately mixed between permission keys and building assignment semantics.

### Org resident admin routes

- `residents.read`
- `residents.write`

### Org resident profile admin routes

- `residents.profile.read`
- `residents.profile.write`

### Resident self-service routes

- `resident.profile.read`
- `resident.profile.write`

## Edge Cases And Important Scenarios

### 1. Building resident onboarding rejects unit mismatch

- Unit comes from the body while building comes from the route.
- Service explicitly checks that the unit belongs to the requested building.

### 2. Building resident onboarding rejects occupied units

- Occupancy conflict is enforced via lifecycle service and occupancy constraints.
- This is already covered in integration tests.

### 3. Org resident creation does not create occupancy

- `POST /org/residents` creates an account and optional profile only.
- A user created here can be resident-like without actually living in a unit yet.

### 4. `includeUnassigned` is profile-driven, not invite-driven

- Building resident list only appends users with:
  - no active occupancy
  - matching `preferredBuildingId`
- Residents without that profile hint will not show up as unassigned for the building.

### 5. Resend cooldown may block repeated recovery attempts

- Cooldown is based on the last invite timestamp.
- A recently failed invite can still block another resend attempt until cooldown passes.

### 6. Resident self-service can return a valid resident user with no active occupancy

- `/resident/me` returns the user even if occupancy is `null`.
- That matches tests and is important for pre-move-in or former-resident states.

### 7. Profile endpoints operate on any org user, not only explicit resident-role users

- `ResidentProfilesService.assertUserInOrg(...)` verifies org membership only.
- That means profile upsert can attach a resident profile to any user in the org.
- In practice, that profile attachment is one of the signals that makes the user appear resident-like.

### 8. Building resident directory and building resident list are not the same product surface

- building resident list:
  - simpler
  - occupancy list with optional unassigned append
- resident directory:
  - richer
  - cursor-paginated
  - search/sort capable
  - contract-aware

Teams should not assume these two endpoints are interchangeable.

### 9. Invite status semantics depend on time

- `PENDING` vs `EXPIRED` is computed at read time from `expiresAt`.
- That means the same row changes API status without the DB status changing from `SENT`.

### 10. Avatar upload is storage-coupled

- Upload success depends on storage availability and URL generation.
- This route mutates user identity state rather than resident-profile state.

## Cross-Module Dependencies

### Users / lifecycle

- Most real provisioning behavior is delegated to `OrgUserLifecycleService`.
- That includes generated passwords, invites, baseline permission setup, and occupancy mutation.

### Occupancies

- Building resident list and resident directory both rely heavily on occupancy data.
- Occupancy status drives resident classification and resident self-service occupancy output.

### Auth

- Invite resend delegates to `AuthService.requestPasswordReset(...)` using `RESIDENT_INVITE` purpose.
- Resident onboarding email flow is therefore built on the auth password-reset pipeline.

### Leases

- Resident directory loads lease data and derives contract-related action flags from it.
- Lease lifecycle also creates and ends occupancies that this module later reads.

### Access control

- Resident routes rely on both explicit permission keys and building-access logic.
- Self-service permission keys are separate from admin-side resident profile keys.

## Strengths

- Covers the full resident surface from admin onboarding to self-service.
- Good reuse of `OrgUserLifecycleService` instead of re-implementing account provisioning.
- Directory and invite lists use cursor pagination rather than offset pagination.
- Resident profile handling is separated into its own service/repo pair.
- Self avatar upload includes MIME-type and size enforcement.
- Tests cover both org-admin and resident-self flows.

## Risks And Design Weaknesses

### 1. The module boundary is too broad

- Building resident operations, org resident admin, invites, profiles, and self-service all live here.
- That increases mental overhead and makes ownership less obvious.

### 2. Resident identity is inferred from multiple signals

- A user can become resident-like through:
  - profile
  - occupancy
  - invite history
- That is flexible, but it weakens clarity and can produce surprising classification behavior.

### 3. Search in org resident list appears to overwrite resident-only filtering

- `listResidentsInOrg(...)` starts with resident-identifying `OR` conditions.
- When `q` is present, those `OR` conditions are replaced by name/email search conditions.
- Result: a matching org user could potentially appear in the resident list even if they are not resident-like.

This is one of the clearest review items in the current implementation.

### 4. Resident directory profile mapping appears inconsistent

- The directory query selects a subset of resident-profile fields.
- The response mapper also emits `preferredBuildingId`.
- That field is not selected in the query, so it is likely always `null` in this response path.

### 5. Contract action flags in resident directory are partly UI hints, not authoritative workflow rules

- `canAddContract` is always `true`.
- `canRequestMoveIn` is always `false`.
- Other flags are derived with lightweight heuristics.
- This can drift from the true lease/business workflow if the UI treats these flags as authoritative.

### 6. Profile upsert is classification-capable

- Because any org user can receive a resident profile, resident profile write is not just profile maintenance.
- It can also make a user qualify as resident-like in list logic.

### 7. Building resident list append behavior is incomplete by design

- `includeUnassigned` depends only on preferred building plus lack of active occupancy.
- Residents with invite history or profile data but without `preferredBuildingId` are invisible in that path.

## Improvement Opportunities

### High priority

- Fix org resident search so resident-only classification is preserved when `q` is used.
- Decide whether resident identity should remain inferred or become an explicit domain state.
- Split or at least document the module into clearer subdomains:
  - onboarding
  - resident registry
  - profile management
  - self-service

### Medium priority

- Decide whether resident directory action flags are UI hints or authoritative permissions/workflow capabilities.
- Align resident directory profile selection with the response shape.
- Consider a dedicated resident timeline that combines invite, profile, occupancy, and lease milestones.
- Move invite sending and resend flows onto queue-backed delivery if invite reliability matters more now.

### Lower priority

- Add stronger filtering/search options on the simple building resident list.
- Consider whether avatar upload should support replacement cleanup and storage lifecycle rules.

## Concrete Review Questions For Your Lead

1. Should "resident" be an explicit domain state, or is inferred resident-ness still acceptable?
2. Do you want building resident list and resident directory to remain separate surfaces, or should one become canonical?
3. Should resident profile write be allowed for any org user, or only for users already classified as residents?
4. Are resident directory action flags intended to drive UI only, or should they represent stronger backend guarantees?
5. Is the current invite pipeline through auth sufficient, or should resident invites become a first-class async workflow?

## Testing Signals

### Main integration coverage already present

- `test/org-residents.e2e.spec.ts`
- `test/org-residents-list.e2e.spec.ts`
- `test/resident-directory.e2e.spec.ts`
- `test/resident-profiles.e2e.spec.ts`
- `test/resident-self-profile.e2e.spec.ts`

### Notable cases already tested

- org admin onboarding into a building and unit
- rejection of unit mismatch
- rejection of occupied unit
- manager/building-admin/staff write differences
- cross-org resident access isolation
- building resident list status filtering
- org resident list status categories:
  - `NEW`
  - `FORMER`
  - `WITH_OCCUPANCY`
  - `WITHOUT_OCCUPANCY`
- invite list filtering and cursor pagination
- resend endpoint using `RESIDENT_INVITE`
- resend cooldown enforcement
- resident directory sorting and active lease inclusion
- org resident profile read/write permissions and cross-org hiding
- resident self avatar upload and unsupported MIME rejection
- `/resident/me` returning `occupancy = null` when appropriate

## Suggested Follow-On Docs

- A resident lifecycle diagram linking invite, profile, occupancy, lease, and move-out.
- A small matrix showing which route is intended for:
  - org admins
  - building operators
  - residents themselves
