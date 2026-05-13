# Frontend Handoff: Fix `/org/users/provision` For RBAC V2

Use this file when updating the web app provisioning flow to match the current backend contract.

## Problem

The frontend is still sending the old payload shape to:

- `POST /api/org/users/provision`

Current frontend shape:

```json
{
  "identity": { "...": "..." },
  "grants": {
    "orgAccess": { "roleId": "..." },
    "buildingAssignments": [
      { "buildingId": "...", "type": "MANAGER" }
    ],
    "resident": {
      "buildingId": "...",
      "unitId": "...",
      "mode": "ADD"
    }
  }
}
```

That shape is no longer accepted by the backend.

The backend validation pipe uses:

- `whitelist: true`
- `forbidNonWhitelisted: true`

So unknown fields like `grants` are rejected with `400 Bad Request`.

## Backend Reality

The backend now expects this DTO shape:

```json
{
  "identity": {
    "email": "user@example.com",
    "name": "User Name",
    "password": "optional-password",
    "sendInvite": true
  },
  "accessAssignments": [
    {
      "roleTemplateId": "optional-role-template-id",
      "roleTemplateKey": "optional-role-template-key",
      "scopeType": "ORG",
      "scopeId": null
    },
    {
      "roleTemplateId": "optional-role-template-id",
      "roleTemplateKey": "building_manager",
      "scopeType": "BUILDING",
      "scopeId": "building-uuid"
    }
  ],
  "resident": {
    "buildingId": "building-uuid",
    "unitId": "unit-uuid",
    "mode": "ADD"
  },
  "mode": {
    "ifEmailExists": "LINK",
    "requireSameOrg": true
  }
}
```

Important:

- `accessAssignments` is the canonical replacement for `grants`.
- Each access assignment must use:
  - `roleTemplateId`, or
  - `roleTemplateKey`
- `scopeType` must be:
  - `ORG`
  - `BUILDING`
- `scopeId` must be:
  - `null` for `ORG`
  - `buildingId` for `BUILDING`

## Best Frontend Mapping

The easiest frontend fix is:

- Keep using the selected org role template id for org-scoped access.
- Map legacy building assignment types to backend role template keys.

Recommended mapping:

- `BUILDING_ADMIN` -> `building_admin`
- `MANAGER` -> `building_manager`
- `STAFF` -> `building_staff`

This means the frontend does not need to pre-resolve a building role template id before provisioning.

## What To Change

Target file:

- `src/lib/api/users.ts`

### 1. Replace `ProvisionUserPayload`

Remove the old `grants` shape and use:

```ts
export type ProvisionUserPayload = {
  identity: {
    email: string;
    name?: string;
    password?: string;
    sendInvite?: boolean;
  };
  accessAssignments?: Array<{
    roleTemplateId?: string;
    roleTemplateKey?: string;
    scopeType: 'ORG' | 'BUILDING';
    scopeId?: string | null;
  }>;
  resident?: {
    buildingId: string;
    unitId?: string;
    mode: 'ADD' | 'MOVE' | 'MOVE_OUT';
  };
  mode?: {
    ifEmailExists?: 'LINK' | 'ERROR';
    requireSameOrg?: boolean;
  };
};
```

### 2. Build `accessAssignments` Instead Of `grants`

Replace the current provisioning payload builder with logic like:

```ts
const accessAssignments: NonNullable<ProvisionUserPayload['accessAssignments']> = [];

if (orgAccessRoleId) {
  accessAssignments.push({
    roleTemplateId: orgAccessRoleId,
    scopeType: 'ORG',
    scopeId: null,
  });
}

const buildingRoleKeyByType = {
  BUILDING_ADMIN: 'building_admin',
  MANAGER: 'building_manager',
  STAFF: 'building_staff',
} as const;

if (Array.isArray(data.buildingAssignments) && data.buildingAssignments.length > 0) {
  accessAssignments.push(
    ...data.buildingAssignments.map((assignment) => ({
      roleTemplateKey: buildingRoleKeyByType[assignment.type],
      scopeType: 'BUILDING' as const,
      scopeId: assignment.buildingId,
    })),
  );
} else if (baseRole === 'admin' && buildingIds.length > 0) {
  accessAssignments.push(
    ...buildingIds.map((buildingId) => ({
      roleTemplateKey: 'building_admin',
      scopeType: 'BUILDING' as const,
      scopeId: buildingId,
    })),
  );
} else if ((baseRole === 'manager' || baseRole === 'employee') && buildingId) {
  accessAssignments.push({
    roleTemplateKey: baseRole === 'manager' ? 'building_manager' : 'building_staff',
    scopeType: 'BUILDING',
    scopeId: buildingId,
  });
}

const resident =
  data.resident
    ? data.resident
    : baseRole === 'tenant' && buildingId && data.unitId
      ? {
          buildingId,
          unitId: data.unitId,
          mode: 'ADD' as const,
        }
      : undefined;

const payload: ProvisionUserPayload = {
  identity,
  ...(accessAssignments.length > 0 ? { accessAssignments } : {}),
  ...(resident ? { resident } : {}),
};
```

### 3. Stop Sending `grants`

Do not send:

- `grants.orgAccess`
- `grants.buildingAssignments`
- `grants.resident`

The backend does not accept that wrapper anymore.

## Response Handling Changes

The response shape also moved to canonical RBAC fields.

### Old frontend assumptions to remove

- `applied.orgAccess` is a single object
- `applied.buildingAssignments` exists as the canonical result

### Current backend reality

`response.applied` now looks like:

```json
{
  "orgAccess": [
    {
      "assignmentId": "...",
      "roleTemplateKey": "org_admin",
      "scopeType": "ORG",
      "scopeId": null
    }
  ],
  "buildingAccess": [
    {
      "assignmentId": "...",
      "roleTemplateKey": "building_manager",
      "scopeType": "BUILDING",
      "scopeId": "building-uuid"
    }
  ],
  "resident": {
    "occupancyId": "...",
    "unitId": "...",
    "buildingId": "..."
  }
}
```

The returned `user` payload also uses canonical RBAC fields:

- `orgAccess`
- `buildingAccess`
- `resident`
- `effectivePermissions`
- `permissionOverrides`

Frontend normalization should prefer those fields over any legacy compatibility fields.

## Minimal Safe Fix

If you want the smallest change that unblocks user provisioning:

1. Keep current UI role selection.
2. Convert that selection into `accessAssignments`.
3. Use `roleTemplateId` for org-scoped template selection.
4. Use `roleTemplateKey` for building-scoped legacy type mapping.
5. Keep `resident` as a top-level field.
6. Stop reading `applied.buildingAssignments` as canonical output.

## Good Follow-Up Refactor

After provisioning is fixed:

1. Replace all remaining role-name-based write flows with access-assignment flows.
2. Prefer `roleTemplateKey` / `roleTemplateId` over legacy `type`.
3. Normalize user state from:
   - `orgAccess`
   - `buildingAccess`
   - `resident`
   - `effectivePermissions`
4. Remove assumptions that a single legacy role field drives RBAC.

## Ready-To-Paste Prompt For A Frontend Agent

```md
Fix the frontend provisioning flow for RBAC v2.

Problem:
- `POST /org/users/provision` no longer accepts the old `grants` payload wrapper.
- The backend now expects `identity`, optional `accessAssignments[]`, optional `resident`, and optional `mode`.
- Backend validation rejects unknown fields, so sending `grants` causes `400 Bad Request`.

Required changes:
1. In `src/lib/api/users.ts`, replace the old `ProvisionUserPayload` type so it uses:
   - `identity`
   - `accessAssignments?: { roleTemplateId?, roleTemplateKey?, scopeType, scopeId? }[]`
   - `resident?`
   - `mode?`
2. Replace the current `grants` payload builder with `accessAssignments`.
3. Map legacy building assignment types as:
   - `BUILDING_ADMIN` -> `building_admin`
   - `MANAGER` -> `building_manager`
   - `STAFF` -> `building_staff`
4. For org-scoped access, keep using `roleTemplateId`.
5. For building-scoped access, send `roleTemplateKey` plus:
   - `scopeType: 'BUILDING'`
   - `scopeId: buildingId`
6. Keep resident provisioning as top-level `resident`.
7. Update response normalization so `response.applied` uses:
   - `orgAccess`
   - `buildingAccess`
   - `resident`
   instead of legacy `buildingAssignments`.

Success criteria:
- Provisioning no longer returns `400 Bad Request`.
- Org-scoped assignments create correctly.
- Building-scoped assignments create correctly.
- Resident provisioning still works.
- Returned user normalization uses canonical RBAC fields.
```

