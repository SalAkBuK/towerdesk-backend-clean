# Access Control Review

## Scope

- Source: `src/modules/access-control`
- Main files:
  - `roles.controller.ts`
  - `roles-legacy.controller.ts`
  - `roles.service.ts`
  - `permissions.controller.ts`
  - `permissions.service.ts`
  - `user-access.controller.ts`
  - `user-access.service.ts`
  - `access-control.service.ts`
  - `access-control.repo.ts`
  - `user-access-projection.service.ts`
  - `role-defaults.ts`
- Public routes:
  - `GET /permissions`
  - `GET|POST|PATCH|DELETE /role-templates`
  - Compatibility aliases under `GET|POST|PATCH|DELETE /roles`
  - `GET|POST|DELETE /users/:userId/access-assignments`
  - `POST|GET /users/:userId/permissions`
  - `POST /users/effective-permissions`
- Core responsibility: define who can do what, in which scope, and how that access is projected back into auth and user responses.

## What This Module Really Owns

- The canonical RBAC v2 model:
  - role templates
  - scoped user access assignments
  - user-specific permission overrides
- Visibility rules for system vs custom role templates.
- The permission-computation algorithm.
- Compatibility aliases for older role-management endpoints.
- Projection of access state into the `user` payload used across the app.

## Core Concepts

### 1. Role templates

- A role template is a reusable access definition.
- Templates are org-owned.
- Templates have a `scopeType`:
  - `ORG`
  - `BUILDING`
- Templates map to a set of permission keys.

### 2. User access assignments

- A user is granted a role template through a `UserAccessAssignment`.
- Assignment scope must match the template scope.
- `ORG` assignment means `scopeId=null`.
- `BUILDING` assignment means `scopeId=<buildingId>`.

### 3. Permission overrides

- A user can also get direct overrides:
  - `ALLOW`
  - `DENY`
- These are applied after role-derived permissions are collected.

### 4. Projection layer

- The module does not stop at "can user do X?"
- It also builds normalized user metadata:
  - `orgAccess`
  - `buildingAccess`
  - `effectivePermissions`
  - `permissionOverrides`
  - `persona` summary such as resident/owner/provider/building-staff/org-admin/platform-admin

## Step-By-Step Request Flows

### 1. List permissions

1. Controller accepts `GET /permissions`.
2. User is authenticated by `JwtAuthGuard`.
3. Service checks whether the user is a platform superadmin.
4. If not platform superadmin, service computes effective permissions in current org scope.
5. User must have `roles.read`.
6. All permissions are loaded.
7. Platform permissions are hidden from org-scoped callers.
8. Response returns visible permissions only.

### 2. List role templates

1. Controller accepts `GET /role-templates`.
2. `JwtAuthGuard`, `OrgScopeGuard`, and `PermissionsGuard` run.
3. Caller must have `roles.read`.
4. Repo loads role templates with permissions for that org.
5. Hidden templates are filtered out.
6. Response returns visible system templates plus custom templates.

### 3. Create role template

1. Controller accepts `POST /role-templates`.
2. Caller must have `roles.write`.
3. Service additionally checks that the actor is actually `org_admin`.
4. Key is normalized.
5. Reserved keys such as `platform_superadmin` are rejected.
6. Permission keys are resolved to permission IDs.
7. Role template row is created.
8. Template-to-permission links are written.
9. Fresh role detail is returned.

### 4. Update role template

1. Controller accepts `PATCH /role-templates/:id`.
2. Caller must have `roles.write`.
3. Service again enforces `org_admin`.
4. Existing template is loaded.
5. Hidden/non-visible templates are treated as not found.
6. System templates cannot be edited.
7. Name/description and permission mappings are updated.
8. Fresh role detail is returned.

### 5. Delete role template

1. Controller accepts `DELETE /role-templates/:id`.
2. Caller must have `roles.write`.
3. Service enforces `org_admin`.
4. Existing template is loaded and visibility-checked.
5. System templates cannot be deleted.
6. Assigned template count is checked.
7. Assigned templates fail with conflict.
8. Unassigned custom template is deleted.

### 6. List user access assignments

1. Controller accepts `GET /users/:userId/access-assignments`.
2. Caller must have `users.read`.
3. Service verifies target user belongs to the caller org.
4. Repo loads target user assignments in that org.
5. Hidden templates are filtered out.
6. Response returns normalized assignment objects.

### 7. Create user access assignment

1. Controller accepts `POST /users/:userId/access-assignments`.
2. Caller must have `users.write`.
3. Service verifies target user belongs to caller org.
4. Requested role template is loaded and visibility-checked.
5. Assignment scope must match template scope.
6. `ORG` assignment must use `scopeId=null`.
7. `BUILDING` assignment must include a valid building in the same org.
8. Duplicate assignment check runs.
9. Assignment is created.
10. Fresh assignment record is loaded and returned.

### 8. Delete user access assignment

1. Controller accepts `DELETE /users/:userId/access-assignments/:assignmentId`.
2. Caller must have `users.write`.
3. Service verifies target user belongs to caller org.
4. Assignment is loaded in org scope.
5. If assignment does not belong to that user, it is treated as not found.
6. Assignment is deleted.

### 9. Set permission overrides

1. Controller accepts `POST /users/:userId/permissions`.
2. Caller must have `users.write`.
3. Service verifies target user belongs to caller org.
4. Input permission keys are resolved to IDs.
5. Missing permission keys fail with `BadRequestException`.
6. Existing overrides are replaced wholesale.
7. Fresh effective permissions are recomputed and returned.

### 10. Get effective permissions for one or many users

1. Controller accepts `GET /users/:userId/permissions` or `POST /users/effective-permissions`.
2. Caller must have `users.write`.
3. Service verifies target users belong to caller org.
4. Effective permissions are computed via role-derived permissions plus overrides.
5. Sorted key arrays are returned.

## Permission Computation Model

### Current algorithm

1. Load visible assignments in requested scope.
2. Flatten role-template permission keys from those assignments.
3. Build a `Set` of permission keys.
4. Apply user overrides:
   - `ALLOW` adds the permission
   - `DENY` removes the permission
5. Return the resulting set.

### Scope behavior

- Org-scoped evaluation:
  - includes only org-scoped assignments when no building context is supplied
- Building-scoped evaluation:
  - includes org-scoped assignments
  - also includes building-scoped assignments for the selected building
- Any-scope evaluation:
  - includes all visible assignments across the org regardless of building scope

## Visible Vs Hidden Role Templates

### Visible system templates

- `org_admin`
- `viewer`
- `building_admin`
- `building_manager`
- `building_staff`

### Hidden or reserved behavior

- `platform_superadmin` is hidden from ordinary org-facing lists.
- Custom templates with `isSystem=false` are visible.
- Older hidden role shapes are intentionally filtered out from normal user-facing responses and permission derivation unless explicitly requested with `includeHiddenRoleTemplates`.

## Compatibility Layer

### Why it exists

- The codebase still supports older consumers that expect `/roles` rather than `/role-templates`.
- The service layer is shared so behavior remains aligned.

### Risk introduced

- The compatibility layer increases API surface area.
- It becomes easier for docs, frontends, or future developers to mix old vocabulary with new model vocabulary.

## Projection Layer And Why It Matters

`UserAccessProjectionService` is effectively the "RBAC read model" for the rest of the system.

It composes:

- visible org and building assignments
- active resident occupancy
- resident invite status
- owner grant presence
- provider membership plus grant status
- effective permissions
- persona summary flags

This means the access-control module is not just policy enforcement. It also determines how the whole system understands a user’s identity mix.

## Edge Cases And Important Scenarios

### Role-template management edge cases

- Only `org_admin` can create, update, or delete templates even if another user somehow has `roles.write`.
- Reserved key `platform_superadmin` is blocked before persistence.
- Duplicate template keys map to `409 Conflict`.
- System templates cannot be edited or deleted.
- Hidden templates are treated as non-existent in ordinary flows.

### Assignment edge cases

- Role-template scope and assignment scope must match exactly.
- `ORG` assignments must use `scopeId=null`.
- `BUILDING` assignments require a valid building inside the caller org.
- Duplicate assignments are rejected.
- Deleting an assignment for the wrong user returns not found behavior.

### Permission-visibility edge cases

- Org-scoped callers cannot inspect platform permissions.
- Platform superadmin can.
- A user without `roles.read` cannot list permissions even though the route itself is only JWT-guarded at controller level.

### Projection/persona edge cases

- Invited residents without active occupancy can still be classified as residents.
- A user can simultaneously appear as resident, owner, provider, building staff, and org admin.
- Provider membership alone is not enough; active provider grant state can affect provider persona visibility.
- Hidden role templates are excluded from normalized assignment projection.

## Strengths

- Clear separation between template management, assignment management, computation, and projection.
- Scope rules are explicit in code.
- Visibility filtering protects org-facing consumers from platform-only internals.
- Compatibility alias reuses the same service layer rather than duplicating logic.
- The projection service creates a strong shared user-access contract for other modules.

## Risks And Design Weaknesses

### 1. Terminology complexity

- The module uses overlapping language:
  - roles
  - role templates
  - org access
  - building access
  - permission overrides
- This is technically understandable, but it increases onboarding cost and makes misuse more likely.

### 2. Compatibility surface still exists

- `/roles` and `/role-templates` both exist.
- Compatibility paths are useful short term but create long-term drift risk in docs, frontend assumptions, and test coverage.

### 3. Effective permissions are computed on demand

- This keeps correctness simple.
- It may become a performance hotspot because projection and guard-heavy endpoints hit this logic frequently.

### 4. Weak audit story for high-impact changes

- Role-template changes, assignment changes, and permission override changes are security-sensitive.
- Current implementation is functional but not visibly audit-first.

### 5. Persona projection is powerful but dense

- The projection service centralizes many identity axes.
- That reduces duplication, but it also means a subtle bug here affects auth payloads, user listings, and multiple modules downstream.

## Improvement Opportunities

### High priority

- Add audit logging or persisted audit tables for:
  - role-template create/update/delete
  - access-assignment create/delete
  - permission override changes
- Publish a short internal model document defining the canonical terms and examples.
- Add explicit deprecation strategy for `/roles` compatibility routes.

### Medium priority

- Add caching for effective-permission computation with reliable invalidation on assignment/template/override change.
- Add bulk assignment-management flows if admin usage is heavy.
- Add clearer UI/API distinction between assignable org templates and building templates.

### Lower priority

- Add reporting views such as "who currently has building X access" or "which users have explicit denies".
- Consider a more explicit policy engine boundary if permission rules become more dynamic.

## Concrete Review Questions For Your Lead

1. Is the team aligned on RBAC vocabulary, or do the current terms still cause confusion?
2. Do you want to keep compatibility `/roles` endpoints, or should they be formally deprecated?
3. Do you need an audit-grade history of permission and assignment changes?
4. Is request-time permission computation acceptable at expected scale?
5. Should persona projection continue living inside access control, or should some identity axes move closer to their own domains?

## Testing Signals

### Unit coverage already present

- `access-control.service.spec.ts`
- `access-control.repo.spec.ts`
- `roles.service.spec.ts`
- `permissions.service.spec.ts`
- `user-access-projection.service.spec.ts`

### Notable cases already tested

- Allow and deny override resolution.
- Any-scope permission computation.
- Hidden role templates excluded from visible assignments and permissions.
- Only visible role templates are listed.
- `org_admin` requirement for template management.
- Reserved-key rejection.
- Duplicate-key conflict mapping.
- System-template delete restrictions.
- Platform-permission visibility differences.
- Invited-resident persona projection.
- Multi-persona projection across resident/owner/provider/building/org roles.

## Suggested Follow-On Docs

- A one-page RBAC v2 model diagram showing:
  - `RoleTemplate`
  - `UserAccessAssignment`
  - `UserPermission`
  - `UserResponse` projection
- A compatibility note showing old `/roles` semantics versus current `/role-templates` semantics.
