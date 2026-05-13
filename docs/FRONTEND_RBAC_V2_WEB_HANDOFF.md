# Frontend Handoff: RBAC V2 Web App Integration

Use this file as the source of truth for wiring the web app to the new RBAC model.

## Goal

Update the web app so org users are authorized and rendered based on the new scoped access model:

- Org-scoped access is separate from building-scoped access.
- A user can have multiple access assignments.
- Messaging and broadcasts now support explicit "any matching scope" authorization on specific endpoints.
- The frontend must not treat a single legacy role key as the source of truth anymore.

## Backend Reality

The backend now exposes and enforces access using:

- `orgAccess`: org-scoped assignments
- `buildingAccess`: building-scoped assignments
- `effectivePermissions`: union of currently relevant permissions for the evaluated scope
- `permissionOverrides`: optional user-specific allow/deny overrides

Relevant user payload shape:

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "orgId": "uuid",
  "orgAccess": [
    {
      "assignmentId": "uuid",
      "roleTemplateKey": "org_admin",
      "scopeType": "ORG",
      "scopeId": null
    }
  ],
  "buildingAccess": [
    {
      "assignmentId": "uuid",
      "roleTemplateKey": "building_manager",
      "scopeType": "BUILDING",
      "scopeId": "building-uuid"
    }
  ],
  "resident": null,
  "effectivePermissions": [
    "broadcasts.read",
    "messaging.write"
  ],
  "permissionOverrides": []
}
```

## Locked Frontend Rules

- Do not treat `admin`, `manager`, or any old single `role` field as authoritative RBAC state.
- Use `orgAccess` and `buildingAccess` as the source of truth for displayed assignments.
- Use `effectivePermissions` for coarse feature gating only.
- For building-specific actions, also respect the selected building or resource building context.
- Do not assume that a user with building-scoped access has org-wide access.
- Do not assume that `building_admin` is equivalent to org admin.
- Do not assume messaging/broadcast visibility can be derived only from the currently selected building in the UI. The backend now handles any-scope resolution for the affected endpoints.

## Endpoints Affected By Any-Scope Resolution

These endpoints can succeed when the user has the required permission in any relevant scope, not only an org-wide scope:

### Broadcasts

- `POST /org/broadcasts`
- `GET /org/broadcasts`
- `GET /org/broadcasts/:id`

### Messaging

- `POST /org/conversations`
- `GET /org/conversations`
- `GET /org/conversations/:id`
- `POST /org/conversations/:id/messages`
- `POST /org/conversations/:id/read`

Important:

- The frontend should stop blocking these pages/actions just because the user lacks an org-wide admin-style role.
- If the user has the relevant permission through at least one building-scoped assignment, these flows may still be valid.

## Messaging UI Behavior

- Show messaging entry points when the user has `messaging.read` or `messaging.write` in `effectivePermissions`.
- Allow conversation creation when the user has `messaging.write`.
- For building-scoped messaging users, require `buildingId` in the create conversation payload.
- For org-scoped messaging users, `buildingId` is optional.
- Do not restrict message thread view/send/read to a manually selected building in the UI if the backend returns the conversation successfully.
- Treat `403` as real authorization failure.
- Treat `404` on conversation detail as "not found or not visible to this user".

### Create Conversation Payload

`POST /org/conversations`

```json
{
  "participantUserIds": ["uuid"],
  "subject": "Optional subject",
  "message": "Initial message",
  "buildingId": "optional-building-uuid"
}
```

UI rule:

- If the current user has building-scoped messaging access only, require building selection before submit.

## Broadcasts UI Behavior

- Show broadcast list when the user has `broadcasts.read`.
- Show create broadcast when the user has `broadcasts.write`.
- Do not assume `broadcasts.write` means org-wide targeting.
- If the user is building-scoped only, allow the backend to enforce which buildings are valid.
- When building IDs are omitted on create, the backend will default to all accessible buildings for that user.
- For list view, optional `buildingId` filter is allowed, but do not require one globally.
- Treat `404` on broadcast detail as "not found or not visible to this user".

### Create Broadcast Payload

`POST /org/broadcasts`

```json
{
  "title": "Maintenance notice",
  "body": "Water shutdown at 5 PM",
  "buildingIds": ["uuid"],
  "audiences": ["TENANTS", "STAFF"]
}
```

### List Broadcasts Query

`GET /org/broadcasts?buildingId=<uuid>&limit=20&cursor=<cursor>`

## What To Change In The Web App

1. Replace legacy role-key checks with selectors/helpers based on:
   - `orgAccess`
   - `buildingAccess`
   - `effectivePermissions`

2. Add reusable helpers similar to:

```ts
type AccessAssignment = {
  assignmentId: string;
  roleTemplateKey: string;
  scopeType: 'ORG' | 'BUILDING';
  scopeId: string | null;
};

type CurrentUserAccess = {
  orgAccess: AccessAssignment[];
  buildingAccess: AccessAssignment[];
  effectivePermissions: string[];
};

export function hasPermission(
  access: CurrentUserAccess | null | undefined,
  permission: string,
) {
  return Boolean(access?.effectivePermissions?.includes(permission));
}

export function hasBuildingAssignment(
  access: CurrentUserAccess | null | undefined,
  buildingId: string,
) {
  return Boolean(
    access?.buildingAccess?.some((assignment) => assignment.scopeId === buildingId),
  );
}

export function hasBuildingRole(
  access: CurrentUserAccess | null | undefined,
  buildingId: string,
  roleTemplateKey: string,
) {
  return Boolean(
    access?.buildingAccess?.some(
      (assignment) =>
        assignment.scopeId === buildingId &&
        assignment.roleTemplateKey === roleTemplateKey,
    ),
  );
}
```

3. Update all messaging and broadcast screens so they:
   - rely on permissions, not legacy role names
   - allow building-scoped users into the feature
   - pass `buildingId` when the UI is operating inside a concrete building context
   - let the backend be the final authority on scope-sensitive mutations

4. Update any current-user store/type definitions to include:
   - `orgAccess`
   - `buildingAccess`
   - `resident`
   - `effectivePermissions`
   - `permissionOverrides`

5. Remove UI assumptions that:
   - only org admins can message
   - only org admins can create/list broadcasts
   - one display role maps 1:1 to all capabilities

## Recommended UX Decisions

- If the user has `messaging.write` but no obvious org-wide access, show a building selector in the create-conversation form.
- If the user arrives from a building page, prefill `buildingId`.
- If the user has `broadcasts.write`, show the composer even when they are only building-scoped.
- For building-scoped users, label the experience clearly:
  - "Applies to accessible buildings"
  - "Select building"
- Prefer hiding actions the user clearly cannot perform, but still handle backend `403` defensively.

## Acceptance Checklist

- A user with only `building_manager` access for Building A can open messaging UI.
- That user can create a conversation for Building A.
- That user cannot create a conversation for Building B.
- A user with only building-scoped `broadcasts.read` can open the broadcast list and only sees readable items.
- A user with only building-scoped `broadcasts.write` can create broadcasts for accessible buildings.
- Org-wide users still work without extra building selection friction.
- No page depends on a legacy single-role field for RBAC decisions.
- No UI labels building-scoped roles as org-wide admin.

## Ready-To-Paste Prompt For A Frontend Agent

```md
Implement the backend RBAC v2 changes in the web app.

Context:
- The backend no longer uses a single legacy role as the source of truth.
- Current-user payload now exposes `orgAccess`, `buildingAccess`, `resident`, `effectivePermissions`, and optional `permissionOverrides`.
- Messaging and broadcasts now support explicit any-scope authorization on these endpoints:
  - POST /org/conversations
  - GET /org/conversations
  - GET /org/conversations/:id
  - POST /org/conversations/:id/messages
  - POST /org/conversations/:id/read
  - POST /org/broadcasts
  - GET /org/broadcasts
  - GET /org/broadcasts/:id
- Building-scoped users may be authorized for these features even without org-wide access.
- For building-scoped messaging creation, `buildingId` should be provided.
- For broadcast creation, omitted `buildingIds` means all accessible buildings.

What to do:
1. Update frontend user/access types to include:
   - `orgAccess: { assignmentId, roleTemplateKey, scopeType, scopeId }[]`
   - `buildingAccess: { assignmentId, roleTemplateKey, scopeType, scopeId }[]`
   - `resident`
   - `effectivePermissions: string[]`
   - `permissionOverrides?: { permissionKey, effect }[] | null`
2. Replace legacy single-role RBAC checks with helpers/selectors based on `effectivePermissions`, `orgAccess`, and `buildingAccess`.
3. Update messaging screens so users with `messaging.read`/`messaging.write` can access them even if they are only building-scoped.
4. Update broadcast screens so users with `broadcasts.read`/`broadcasts.write` can access them even if they are only building-scoped.
5. In the create-conversation UI, require a building selector when the user is building-scoped only.
6. In the create-broadcast UI, allow building-scoped users and let the backend enforce allowed buildings.
7. Remove assumptions that `building_admin` or other building roles imply org-wide admin.
8. Preserve defensive handling for backend `403` and `404`.

Acceptance criteria:
- Building-scoped messaging users can use valid messaging flows for their buildings.
- Building-scoped broadcast users can list/read/create within allowed scope.
- Org-wide users still work.
- No remaining UI RBAC logic depends on a legacy single role field.

When done, summarize:
- files changed
- old assumptions removed
- any backend fields the app still needs but does not yet receive
```

