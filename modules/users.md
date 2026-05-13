# Users Review

## Scope

- Source: `src/modules/users`
- Main files:
  - `users.controller.ts`
  - `org-users.controller.ts`
  - `org-users-provision.controller.ts`
  - `users.service.ts`
  - `org-users-provision.service.ts`
  - `org-user-lifecycle.service.ts`
  - `users.repo.ts`
- Public routes:
  - `GET /users/me`
  - `PATCH /users/me/profile`
  - `POST /users/me/avatar`
  - `GET /users/:id`
  - `GET /org/users`
  - `POST /org/users/provision`
- Core responsibility: user self-service profile access plus org-scoped user listing and user provisioning.

## What This Module Really Owns

- Self-profile read and update.
- Self-avatar upload through the storage layer.
- Org user listing and org-local user detail.
- The "one-shot provisioning" workflow that can:
  - create or link a user
  - assign org/building access
  - create or move occupancy
  - optionally trigger invite/reset onboarding

## Important Architectural Note

This module is split into two very different layers:

- `UsersService`
  - simple read/update/self-service operations
- `OrgUserLifecycleService`
  - the real orchestration engine

That means the route count understates the actual business complexity.

## Step-By-Step Request Flows

### 1. Get current user

1. Controller accepts `GET /users/me`.
2. `JwtAuthGuard` authenticates the caller.
3. Service loads the user by id.
4. Full projected user payload is built through `OrgUserLifecycleService`.

### 2. Update current user profile

1. Controller accepts `PATCH /users/me/profile`.
2. `JwtAuthGuard` authenticates the caller.
3. Service verifies the user exists.
4. Repo updates allowed profile fields:
   - `name`
   - `avatarUrl`
   - `phone`
5. Updated user is projected back into the shared user response shape.

### 3. Upload current user avatar

1. Controller accepts `POST /users/me/avatar`.
2. File interceptor enforces a 5 MB max upload size.
3. Service verifies caller identity.
4. Service rejects missing file payload.
5. Service validates mime type:
   - `image/jpeg`
   - `image/jpg`
   - `image/png`
   - `image/webp`
6. Service verifies the user still exists.
7. Storage object key is generated under:
   - `avatars/<orgId or unscoped>/<userId>/<timestamp-uuid-sanitized-filename>`
8. File is written through `StorageService`.
9. Public URL is generated.
10. User profile `avatarUrl` is updated.
11. Response returns `{ avatarUrl }`.

### 4. Get a user by id inside org scope

1. Controller accepts `GET /users/:id`.
2. `JwtAuthGuard`, `PermissionsGuard`, and `OrgScopeGuard` run.
3. Caller must have `users.read`.
4. Service verifies target user belongs to the same org.
5. Projected user payload is returned.

### 5. List org users

1. Controller accepts `GET /org/users`.
2. `JwtAuthGuard`, `OrgScopeGuard`, and `PermissionsGuard` run.
3. Caller must have `users.read`.
4. Service loads all users for the org.
5. Each user is projected through the shared lifecycle/projection path.
6. Response returns full enriched user rows, not only raw user table data.

### 6. Provision a user

1. Controller accepts `POST /org/users/provision`.
2. `JwtAuthGuard`, `OrgScopeGuard`, and `PermissionsGuard` run.
3. Caller must have `users.write`.
4. `OrgUsersProvisionService` passes the request into `OrgUserLifecycleService`.
5. Email is normalized.
6. Existing user lookup runs case-insensitively.
7. `ifEmailExists` mode is applied:
   - `ERROR`
   - `LINK`
8. If user exists:
   - org membership rules are checked
   - inactive users are rejected
   - linking can occur if rules allow
9. If user does not exist:
   - name is required
   - password or invite strategy must be valid
   - temp password may be generated
   - user row is created with `mustChangePassword=true`
10. Resident baseline permissions may be added.
11. Access assignments are deduplicated and applied.
12. Resident occupancy grant may be applied:
   - `ADD`
   - `MOVE`
   - `MOVE_OUT`
13. Transaction commits.
14. If `sendInvite=true`, auth password-reset/invite flow is triggered after transaction.
15. Final projected user payload is returned along with applied grants summary.

## Provisioning Subflows

### A. Existing-email handling

Current supported modes:

- `LINK`
  - reuse existing user if allowed
- `ERROR`
  - reject if email already exists

Important behavior:

- If existing user belongs to another org, provisioning usually fails.
- A special path exists for unscoped users when `requireSameOrg=false`.
- Inactive existing users are rejected.

### B. Access assignment application

For each requested access assignment:

1. Resolve template by id or key.
2. Reject missing/non-visible templates.
3. Verify template scope matches requested assignment scope.
4. For `ORG`, require `scopeId=null`.
5. For `BUILDING`, require valid building in caller org.
6. Reject or bypass duplicates safely.
7. Upsert deterministic assignment id.

### C. Resident grant application

`resident.mode` drives different behavior:

- `ADD`
  - create active occupancy if resident is not already occupying another unit
- `MOVE`
  - end other active occupancies in the same building and move into target unit
- `MOVE_OUT`
  - end active occupancies in the building and create no new occupancy

The service also:

- validates building ownership
- validates unit belongs to building
- locks the unit row with `SELECT ... FOR UPDATE`
- rejects occupancy conflicts
- maps occupancy constraint errors into domain-friendly exceptions

## Data And State Model

### Core tables touched directly

- `User`
- `UserAccessAssignment`
- `UserPermission`
- `Occupancy`
- `Building`
- `Unit`
- `Permission`

### External module side effects

- Provision with `sendInvite=true` calls `AuthService.requestPasswordReset(...)`.
- Resident provisioning can imply resident baseline permission setup.
- Final user response is projected through access-control projection logic.

## Edge Cases And Important Scenarios

### Self-service edge cases

- `GET /users/me` and `PATCH /users/me/profile` are authenticated but not org-scoped.
- Avatar uploads are rejected for unsupported mime types.
- Avatar storage path uses `unscoped` when the user has no org.

### Org-visibility edge cases

- `GET /users/:id` is org-scoped and should not leak cross-org user records.
- `GET /org/users` returns enriched user shape, so performance cost grows with user count.

### Provisioning identity edge cases

- Emails are normalized before matching.
- `ERROR` mode rejects existing email reuse.
- Linked existing users must be active.
- Existing unscoped users can be attached to org only when rules explicitly allow.

### Provisioning assignment edge cases

- Duplicate requested assignments are deduped before processing.
- Hidden templates are not assignable in normal provisioning flows.
- Building assignments require a valid building in the same org.
- Template scope and requested scope must align exactly.

### Provisioning resident edge cases

- `MOVE_OUT` does not require `unitId`.
- Non-`MOVE_OUT` resident actions require `unitId`.
- Unit must belong to the requested building.
- Occupied unit for another resident fails with conflict.
- A resident already occupying another unit cannot `ADD` into a second one.
- `MOVE` ends prior active occupancies in the same building before/while creating the new occupancy.

### Invite edge cases

- Transaction completes before invite dispatch.
- Invite dispatch is therefore not part of the DB transaction.
- If invite sending fails after commit, the user and grants already exist.

## Strengths

- Clear separation between thin HTTP layer and actual lifecycle/orchestration logic.
- Provisioning transaction protects multi-step changes from partial database state.
- Unit locking shows good awareness of concurrency around occupancy creation.
- Shared projection logic keeps user payload shape consistent across auth and user endpoints.
- Avatar upload flow has explicit validation and storage key hygiene.

## Risks And Design Weaknesses

### 1. Provisioning is becoming a mini workflow engine

- One endpoint can create identity, access, resident occupancy, and onboarding side effects.
- That is efficient for clients, but it concentrates a lot of business complexity in one service.

### 2. Post-transaction invite dispatch can create "committed but not onboarded" state

- This is often the right tradeoff, but it needs operational visibility.
- Otherwise admins may think provisioning failed when only the invite failed.

### 3. User listing cost can grow

- `GET /org/users` builds projected user responses rather than returning flat rows.
- That is useful for UI consumers but can become expensive at scale.

### 4. Lifecycle logic overlaps multiple domains

- Users module touches auth, access control, residents, occupancies, and storage.
- The boundaries are workable, but they are not lightweight.

### 5. `createInOrg` exists as service functionality without a prominent external controller route

- That suggests there are internal/legacy expectations around simpler org-user creation flows.
- This should stay documented so the team does not lose track of which path is canonical.

## Improvement Opportunities

### High priority

- Add explicit audit records for provisioning actions:
  - user created
  - existing user linked
  - access assignments applied
  - resident occupancy changed
  - invite requested
- Add operational status around invite dispatch after provisioning.
- Add pagination, search, and filtering to `GET /org/users`.

### Medium priority

- Consider splitting provisioning into smaller internal helpers with explicit sub-step boundaries.
- Add idempotency guidance or request correlation if the frontend may retry provision calls.
- Add a clearer admin-facing status model for "created", "linked", "invited", and "resident moved".

### Lower priority

- Add avatar cleanup/versioning strategy if repeated uploads matter.
- Add bulk provisioning/import if orgs commonly onboard large user batches.

## Concrete Review Questions For Your Lead

1. Is `POST /org/users/provision` meant to remain the canonical onboarding entry point for all admin-side user setup?
2. Do you want stronger audit visibility on every side effect produced by provisioning?
3. Is post-commit invite dispatch acceptable, or do you need queued/retriable invite state surfaced to admins?
4. Does `GET /org/users` need pagination now, before user counts grow?
5. Should resident onboarding stay inside the user lifecycle service, or move closer to the residents domain over time?

## Testing Signals

### Unit coverage already present

- `org-user-lifecycle.service.spec.ts`

### Important integration coverage affecting this module

- `test/org-residents.e2e.spec.ts`
- `test/org-profile.e2e.spec.ts`
- `test/platform-org-admin.e2e.spec.ts`

### Notable cases already tested

- Resident baseline permissions added during resident-style provisioning.
- Temp-password onboarding for org admins.
- `mustChangePassword` behavior across password change.
- Self avatar upload success.
- Self avatar mime-type rejection.
- Resident onboarding conflict cases:
  - wrong building/unit pairing
  - occupied unit
  - assignment-based authority differences
  - cross-org isolation

## Suggested Follow-On Docs

- A provisioning sequence diagram from request -> transaction -> invite dispatch.
- A small state table for resident provisioning modes: `ADD`, `MOVE`, `MOVE_OUT`.
