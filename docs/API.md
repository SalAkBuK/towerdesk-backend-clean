# Towerdesk Backend API (Frontend Guide)

Base URL (local):

- `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs`

Auth headers:

- Most endpoints: `Authorization: Bearer <accessToken>`
- Platform endpoints: `x-platform-key: <PLATFORM_API_KEY>`

Common behaviors:

- Org-scoped routes (`/org/*`) require `req.user.orgId` from JWT. Missing org -> 403.
- Cross-org access returns 404 (do not leak existence).
- RBAC v2 uses role templates plus scoped assignments.
- Building-scoped authorization is resolved from building-scoped role template assignments, not legacy building assignment types.
- Resident access remains separate and is derived from occupancy, not staff/admin role templates.
- Auth and user responses expose canonical access axes only:
  - `orgAccess`: org-scoped assignments in the shape `{ assignmentId, roleTemplateKey, scopeType, scopeId }`
  - `buildingAccess`: building-scoped assignments in the same shape
  - `resident`: active occupancy linkage
  - `permissionOverrides`: manual per-user permission exceptions
- Legacy write paths are removed in v2:
  - `POST /org/buildings/:buildingId/assignments`
  - `DELETE /org/buildings/:buildingId/assignments/:assignmentId`
  - `POST /users/:userId/roles`
- Canonical RBAC management paths in v2:
  - `GET|POST /role-templates`
  - `GET|PATCH|DELETE /role-templates/:id`
  - `GET|POST /users/:userId/access-assignments`
  - `DELETE /users/:userId/access-assignments/:assignmentId`
- Compatibility alias retained for legacy role-management reads/writes:
  - `GET|POST /roles`
  - `GET|PATCH|DELETE /roles/:id`
- Compatibility read path retained for building-scoped user listings:
  - `GET /org/buildings/:buildingId/assignments`
- Platform superadmin can act in an org by sending `x-org-id: <orgId>` on `/org/*` requests (token `orgId` is null by design).

## Auth

POST `/auth/register`

- Body: `{ email, password, name? }`
- Returns: `{ accessToken, refreshToken, user }`
- Production default: disabled unless `AUTH_PUBLIC_REGISTER_ENABLED=true`

POST `/auth/login`

- Body: `{ email, password }`
- Returns: `{ accessToken, refreshToken, user }`
- `user` includes:
  - `orgAccess`
  - `buildingAssignments`
  - `resident`
  - `display`
  - compatibility `role` / `baseRole`

POST `/auth/refresh`

- Body: `{ refreshToken }`
- Returns: `{ accessToken, refreshToken, user }`

POST `/auth/logout`

- Returns: `{ success: true }`
- Requires `Authorization: Bearer <accessToken>`
- Clears the stored refresh token hash for the current user (refresh token becomes invalid)

POST `/auth/change-password`

- Body: `{ currentPassword, newPassword }`
- Returns: `{ success: true }`
- Requires `Authorization: Bearer <accessToken>`

POST `/auth/forgot-password`

- Body: `{ email }`
- Returns: `{ success: true }` (always generic to avoid account enumeration)
- If the account exists and is active, a transactional reset email is dispatched.

POST `/auth/reset-password`

- Body: `{ token, newPassword }`
- Returns: `{ success: true }`
- 401 when token is invalid or expired

## Health

GET `/health`

- Returns: `{ status: "ok", timestamp }`

## Platform (requires `x-platform-key`)

GET `/platform/orgs`

- Returns list of orgs
- Requires `platform.org.read` when using JWT

POST `/platform/orgs`

- Body:
  ```
  {
    "name": "Towerdesk Inc.",
    "businessName": "Towerdesk Management LLC",
    "businessType": "PROPERTY_MANAGEMENT",
    "tradeLicenseNumber": "TL-12345",
    "vatRegistrationNumber": "VAT-12345",
    "registeredOfficeAddress": "123 Main St",
    "city": "Dubai",
    "officePhoneNumber": "+971-4-555-0100",
    "businessEmailAddress": "info@towerdesk.com",
    "website": "https://towerdesk.com",
    "ownerName": "Jane Founder"
  }
  ```
- Returns: `{ id, name, createdAt }`

GET `/platform/orgs/:orgId/admins`

- Returns list of org admins for the org
- Requires `platform.org.admin.read` when using JWT

POST `/platform/orgs/:orgId/admins`

- Body: `{ name, email, password? }`
- Returns: `{ userId, email, tempPassword?, mustChangePassword: true }`

GET `/platform/org-admins`

- Returns all org admins across orgs
- Requires `platform.org.admin.read` when using JWT

Authorization options:

- `x-platform-key: <PLATFORM_API_KEY>` (platform key), OR
- `Authorization: Bearer <accessToken>` for a platform superadmin user with:
  - `platform.org.read` for listing orgs
  - `platform.org.create` for org creation
  - `platform.org.admin.read` for listing org admins
  - `platform.org.admin.create` for org admin creation

## Users

GET `/users/me`

- Returns current user
- Requires `users.read`
- Response includes `roleKeys` when assigned

GET `/users/me/assignments`

- Returns building assignments for the current user
- Example response: `[{ "buildingId": "uuid", "buildingName": "Central Tower", "type": "MANAGER" }]`

GET `/users/:id`

- Returns user by id
- Requires `users.read`

POST `/users`

- Body: `{ name, email, password?, roleKeys? }`
- Requires `users.write`
- Creates a user in the caller's org (orgId derived from JWT)
- If `password` is omitted, a temporary password is generated and returned
- `roleKeys` can include `org_admin`, `viewer`, or custom org roles
- `manager`, `staff`, and `building_admin` are building assignments, not org roles
- `resident` is managed through resident workflows, not org roles
- Manager/staff are assigned per building via `/org/buildings/:buildingId/assignments`
- Tenants should be onboarded via `/org/buildings/:buildingId/residents`

GET `/org/users`

- Requires `users.read`
- Returns all users in the caller's org
- Response includes hydrated access metadata for each user:
  - `orgAccess` with `{ roleId, roleKey, roleName, description }`
  - `display` with `{ primaryLabel, badges }`
  - `effectivePermissions`
  - `buildingIds`, `buildingAssignments`
  - `resident`
  - optional `permissionOverrides`
  - compatibility `role`, `baseRole`, `roleIds`, `roleKeys`, `orgRoleKeys`, `assignedRoles`, `roles`
- New frontend/backend work should prefer `orgAccess` + `display` over the compatibility role fields.
- Example:
  ```
  fetch(`${baseUrl}/org/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  ```

POST `/org/users/provision`

- Requires `users.write` (org-scoped) or a building manager assignment (see Notes)
- One-stop provision: create-or-link a user and apply role templates, building assignments, and/or residency in a single transaction (idempotent).
- Body:
  ```
  {
    "identity": {
      "email": "jane@org.com",
      "name": "Jane Admin",
      "password": "optional",
      "sendInvite": true
    },
    "grants": {
      "orgAccess": { "roleId": "uuid" },
      "roleIds": ["uuid"],
      "roleKeys": ["admin"],
      "orgRoleKeys": ["admin", "org_admin"],
      "buildingAssignments": [
        { "buildingId": "uuid", "type": "MANAGER" }
      ],
      "resident": { "buildingId": "uuid", "unitId": "uuid", "mode": "ADD" }
    },
    "mode": {
      "ifEmailExists": "LINK",
      "requireSameOrg": true
    }
  }
  ```
- Notes:
  - `email` is required and normalized to lowercase.
  - When creating: require `password` or `sendInvite=true`.
  - `grants.orgAccess.roleId` is the canonical org access input for this endpoint.
  - `grants.orgAccess.roleKey` is allowed for seeded/system roles.
  - Legacy `roleIds`, `roleKeys`, and `orgRoleKeys` are still accepted for compatibility, but they must resolve to at most one primary org access template.
  - `roleKeys` and legacy `orgRoleKeys` are accepted for backward compatibility and resolved in the same transaction.
  - Unknown role keys -> 400.
  - Unknown role ids -> 400.
  - `resident.mode` can be `ADD`, `MOVE`, or `MOVE_OUT`.
    - `MOVE` ends other ACTIVE occupancies in the same building and creates a new one in the selected unit.
    - `MOVE_OUT` ends ACTIVE occupancies in the same building and does not create a new one (`unitId` not required).
  - Managers without `users.write` can only provision MANAGER/STAFF assignments and/or residents in their assigned buildings. Role assignment by `roleIds`, `roleKeys`, or `orgRoleKeys` is not allowed and `requireSameOrg` is enforced.
  - Effective permissions are resolved dynamically and returned immediately after the transaction commits. They are not materialized as a separate stored snapshot.
- Returns:
  ```
  {
    "user": {
      "id": "uuid",
      "email": "jane@org.com",
      "name": "Jane Admin",
      "orgId": "uuid",
      "role": "admin",
      "baseRole": "admin",
      "orgAccess": {
        "roleId": "uuid",
        "roleKey": "admin",
        "roleName": "admin",
        "description": null
      },
      "display": {
        "primaryLabel": "admin",
        "badges": ["manager", "resident"]
      },
      "roleIds": ["uuid"],
      "roleKeys": ["admin"],
      "effectivePermissions": ["contracts.write", "users.write"],
      "buildingIds": ["uuid"],
      "buildingAssignments": [{ "id": "uuid", "buildingId": "uuid", "type": "MANAGER" }],
      "resident": { "occupancyId": "uuid", "unitId": "uuid", "buildingId": "uuid" },
      "assignedRoles": [
        { "id": "uuid", "key": "admin", "name": "admin", "description": null }
      ]
    },
    "created": true,
    "linkedExisting": false,
    "applied": {
      "orgAccess": {
        "roleId": "uuid",
        "roleKey": "admin",
        "roleName": "admin",
        "description": null
      },
      "roleIds": ["uuid"],
      "roleKeys": ["admin"],
      "orgRoleKeys": ["admin"],
      "roles": [{ "id": "uuid", "key": "admin", "name": "admin", "description": null }],
      "buildingAssignments": [{ "id": "uuid", "buildingId": "uuid", "type": "MANAGER" }],
      "resident": { "occupancyId": "uuid", "unitId": "uuid", "buildingId": "uuid" }
    }
  }
  ```

## Access Control (roles/permissions)

GET `/permissions`

- Requires `roles.read`

GET `/roles`

- Compatibility alias for `GET /role-templates`
- Requires `roles.read`
- Returns assignable org access templates only:
  - system roles: `org_admin`, `viewer`
  - custom roles where `isSystem=false`
- Does not return building assignment types
- Does not return `manager`, `admin`, or `resident` as assignable org access

POST `/roles`

- Compatibility alias for `POST /role-templates`
- Body: `{ key, name, description? }`
- Requires `roles.write`
- Only `org_admin` can create role templates

GET `/roles/:roleId`

- Compatibility alias for `GET /role-templates/:id`
- Requires `roles.read`

PATCH `/roles/:roleId`

- Compatibility alias for `PATCH /role-templates/:id`
- Requires `roles.write`

DELETE `/roles/:roleId`

- Compatibility alias for `DELETE /role-templates/:id`
- Requires `roles.write`
- Only `org_admin` can delete role templates
- Only custom roles (`isSystem=false`) can be deleted
- Returns `409` if the role is still assigned to users

POST `/users/:userId/roles`

- Body: `{ roleIds: string[], mode?: "add"|"replace" }`
- Requires `users.write`
- Still supported for editing existing users after creation.
- Only assignable org access templates are allowed here.
- Passing more than one assignable org role id returns `400`.
- `manager` / `staff` / `building_admin` belong to building assignments.
- This is the legacy editor for the userâ€™s single primary org access role.
- Semantics are now â€œset the single primary org access templateâ€.
- Passing more than one assignable org role id returns `400`.
- Passing `[]` with `mode: "replace"` clears primary org access.
- Passing `[]` with `mode: "add"` is a no-op and returns the current primary org access.
- Resident access is managed by resident workflows, not this endpoint.
- Frontend provisioning flows should prefer `POST /org/users/provision` so user creation + role assignment stays atomic.

POST `/users/:userId/permissions`

- Body: `{ overrides: [{ permissionKey, effect: "ALLOW"|"DENY" }] }`
- Requires `users.write`

## Dashboard (org-scoped)

GET `/org/dashboard/overview`

- Requires `dashboard.read`
- Returns org-level KPIs, building metrics, and trend series

GET `/org/dashboard/activity`

- Requires `dashboard.read`
- Query: `{ limit?: number }`
- Returns a recent org activity feed for maintenance, visitors, parking, broadcasts, and leases
- `limit` is capped at 100

## Buildings (org-scoped)

POST `/org/buildings`

- Body: `{ name }`
- Requires `buildings.write`

GET `/org/buildings`

- Requires `buildings.read`

GET `/org/buildings/assigned`

- Returns buildings where the current user has a building assignment
- Org-scoped (requires JWT with orgId)

GET `/org/buildings/:buildingId`

- Requires `buildings.read`
- Access via global permission OR building assignment

DELETE `/org/buildings/:buildingId`

- Requires `buildings.delete`

## Units (building-scoped)

POST `/org/buildings/:buildingId/units`

- Body:
  ```
  {
    "label": "A-101",
    "floor": 1,
    "notes": "Near elevator",
    "unitTypeId": "uuid",
    "ownerId": "uuid",
    "maintenancePayer": "OWNER",
    "unitSize": 950,
    "unitSizeUnit": "SQ_FT",
    "bedrooms": 2,
    "bathrooms": 2,
    "balcony": true,
    "kitchenType": "OPEN",
    "furnishedStatus": "FULLY_FURNISHED",
    "rentAnnual": 120000,
    "paymentFrequency": "MONTHLY",
    "securityDepositAmount": 5000,
    "serviceChargePerUnit": 1500,
    "vatApplicable": true,
    "electricityMeterNumber": "ELEC-123",
    "waterMeterNumber": "WATER-456",
    "gasMeterNumber": "GAS-789",
    "amenityIds": ["uuid"]
  }
  ```
- Requires `units.write`
- Building managers assigned to the building can create units.

POST `/org/buildings/:buildingId/units/import`

- Upload a CSV as `multipart/form-data` with a `file` field.
- Query:
  - `dryRun=true|false` to validate without writing
  - `mode=create|upsert`
- Requires `units.write`
- CSV headers must be:
  `label,floor,unitType,notes,bedrooms,bathrooms,unitSize,unitSizeUnit,furnishedStatus,balcony,kitchenType,rentAnnual,paymentFrequency,securityDepositAmount,serviceChargePerUnit,vatApplicable,maintenancePayer,electricityMeterNumber,waterMeterNumber,gasMeterNumber`
- Only `label` is required.
- `unitType` must match an active unit type name in the caller org. Matching is case-insensitive after trimming.
- Boolean fields accept: `true`, `false`, `yes`, `no`, `1`, `0`, `y`, `n`
- Enum fields accept:
  - `unitSizeUnit`: `SQ_FT`
  - `furnishedStatus`: `UNFURNISHED`, `SEMI_FURNISHED`, `FULLY_FURNISHED`
  - `kitchenType`: `OPEN`, `CLOSED`
  - `paymentFrequency`: `MONTHLY`, `QUARTERLY`, `SEMI_ANNUAL`, `ANNUAL`
  - `maintenancePayer`: `OWNER`, `TENANT`, `BUILDING`
- Enum values are case-insensitive; spaces and hyphens are normalized to underscores before validation.
- Use `units_template_fixed.csv` as the safe upload template if the CSV asset is included in the repo or release bundle.
- Use `units_import_reference.csv` as the field-by-field guide if the CSV asset is included in the repo or release bundle.

GET `/org/buildings/:buildingId/units`

- Query: `available=true` (optional)
- Requires `units.read`
- Returns minimal unit fields (full details available via unit detail endpoint)

GET `/org/buildings/:buildingId/units/:unitId`

- Requires `units.read`
- Returns full unit record including new fields
  - Example:
    ```
    {
      "id": "uuid",
      "buildingId": "uuid",
      "label": "A-101",
      "unitTypeId": "uuid",
      "ownerId": "uuid",
      "maintenancePayer": "OWNER",
      "floor": 1,
      "notes": "Near elevator",
      "unitSize": "950",
      "unitSizeUnit": "SQ_FT",
      "bedrooms": 2,
      "bathrooms": 2,
      "balcony": true,
      "kitchenType": "OPEN",
      "furnishedStatus": "FULLY_FURNISHED",
      "rentAnnual": "120000",
      "paymentFrequency": "MONTHLY",
      "securityDepositAmount": "5000",
      "serviceChargePerUnit": "1500",
      "vatApplicable": true,
      "electricityMeterNumber": "ELEC-123",
      "waterMeterNumber": "WATER-456",
      "gasMeterNumber": "GAS-789",
      "amenityIds": ["uuid"],
      "amenities": [{ "id": "uuid", "name": "Balcony" }],
      "createdAt": "2025-12-25T19:40:44.583Z",
      "updatedAt": "2025-12-25T19:40:44.583Z"
    }
    ```

PATCH `/org/buildings/:buildingId/units/:unitId`

- Body: same optional fields as create
- Requires `units.write`
- Returns: same as unit detail

GET `/org/buildings/:buildingId/units/basic`

- Resident-safe list (id + label only)
- Requires `units.read` but allows ACTIVE resident occupancy

GET `/org/buildings/:buildingId/units/count`

- Returns `{ total: number, vacant: number }`
- Requires `units.read`

## Building Amenities (building-scoped)

GET `/org/buildings/:buildingId/amenities`

- Returns list of amenities for the building
- Requires `buildings.read`

POST `/org/buildings/:buildingId/amenities`

- Body: `{ name, isDefault?, isActive? }`
- Requires `buildings.write`

PATCH `/org/buildings/:buildingId/amenities/:amenityId`

- Body: `{ name?, isDefault?, isActive? }`
- Requires `buildings.write`

Amenity defaults for unit creation:

- If `amenityIds` is omitted, defaults are auto-assigned from active amenities with `isDefault=true`.
- If `amenityIds: []`, no amenities are assigned.

## Unit Types (org-scoped)

GET `/org/unit-types`

- Returns active unit types
- Requires `unitTypes.read`

POST `/org/unit-types`

- Body: `{ name, isActive? }`
- Requires `unitTypes.write`

## Owners (org-scoped)

GET `/org/owners`

- Query: `search` (optional)
- Returns owners in the org
- Each row includes:
  - `id`
  - `orgId`
  - `partyId`
  - `party?` with:
    - `id`
    - `type = INDIVIDUAL | COMPANY`
    - `displayNameEn`
    - `displayNameAr`
  - `name`
  - `email`
  - `phone`
  - `address`
  - `identifier?` with:
    - `type`
    - `maskedValue`
    - `countryCode`
    - `issuingAuthority`
  - `isActive`
  - `createdAt`
  - `updatedAt`
- Requires `owners.read`

POST `/org/owners`

- Creates or reuses a global `Party` and creates or reuses the org-scoped `Owner`
- Body: `{ name, partyType?, displayNameEn?, displayNameAr?, email?, phone?, address?, resolutionToken?, identifier?, ownerOverrides? }`
- Returns the same enriched owner payload shape as `GET /org/owners`
- Requires `owners.write`

PATCH `/org/owners/:ownerId`

- Updates the org-scoped owner record
- Body: `{ name?, email?, phone?, address?, isActive? }`
- `email`, `phone`, and `address` accept `null` to clear the field
- Does not change party identity, identifiers, or access grants
- Returns the same enriched owner payload shape as `GET /org/owners`
- Returns `404` if the owner is outside the caller's org scope
- Requires `owners.write`

POST `/org/owners/resolve-party`

- Resolves a global owner identity by strong identifier only
- Accepts only strong identifiers such as Emirates ID, passport, trade license, and VAT/TRN
- Returns masked summary data plus a short-lived signed resolution token
- Does not return raw identifiers
- Requires `owner_registry.resolve`

POST `/org/owners/:ownerId/access-grants`

- Primary management flow for granting owner portal access
- Body: `{ email }`
- If the email already belongs to an active user, backend auto-links that user and returns an `ACTIVE` grant immediately
- If the email does not belong to an existing user, backend creates the owner portal user, creates a `PENDING` grant, and sends the onboarding email
- When the invited owner completes password setup, backend activates the pending grant automatically
- Fails if the owner already has an `ACTIVE` representative
- Requires `owner_access_grants.write`

GET `/org/owners/:ownerId/access-grants`

- Lists owner access grants for one owner
- Query: `status=PENDING|ACTIVE|DISABLED` (optional)
- Requires `owner_access_grants.read`
- Each row includes:
  - grant status and timestamps
  - `userId`
  - `inviteEmail`
  - `verificationMethod`
  - optional `linkedUser` with `id`, `email`, `orgId`, `isActive`, `name`

GET `/org/owners/:ownerId/access-grants/history`

- Lists owner access grant audit history for one owner
- Query:
  - `grantId=<uuid>` (optional)
  - `action=INVITED|LINKED|ACTIVATED|DISABLED|RESENT` (optional)
- Requires `owner_access_grants.read`
- Each row includes:
  - `grantId`
  - `action`
  - `fromStatus`
  - `toStatus`
  - `actorUserId`
  - `userId`
  - `inviteEmail`
  - `verificationMethod`
  - optional `actorUser` with `id`, `email`, `name`
  - `createdAt`

POST `/org/owners/:ownerId/access-grants/link-existing-user`

- Fallback/admin recovery endpoint
- Links an existing user to the owner and creates an `ACTIVE` owner access grant
- Body: `{ userId }`
- Fails if the owner already has an `ACTIVE` representative
- Requires `owner_access_grants.write`

POST `/org/owners/:ownerId/access-grants/:grantId/disable`

- Disables a pending or active owner access grant immediately
- Optional body: `{ verificationMethod? }`
- Requires `owner_access_grants.write`

POST `/org/owners/:ownerId/access-grants/:grantId/resend-invite`

- Re-sends the onboarding email and updates `invitedAt` for a pending owner access grant
- Allowed only for `PENDING` grants
- Requires `owner_access_grants.write`

## Service Providers

GET `/org/service-providers`

- Requires `service_providers.read`
- Query: `search` (optional)
- Returns global service providers with current-org linked buildings and provider-admin access state

GET `/org/service-providers/:providerId`

- Requires `service_providers.read`
- Returns one global service provider with current-org linked buildings and provider-admin access state

POST `/org/service-providers`

- Requires `service_providers.write`
- Body:
  - `name` required
  - `serviceCategory`, `contactName`, `contactEmail`, `contactPhone`, `notes`, `isActive` optional
  - `buildingIds` optional
  - `adminEmail` optional initial provider-admin invite

PATCH `/org/service-providers/:providerId`

- Requires `service_providers.write`
- Partial update for provider details and active flag
- Rejected once the provider has an active provider-admin owner

POST `/org/service-providers/:providerId/buildings`

- Requires `service_providers.write`
- Body: `{ buildingId }`
- Building must belong to the same org

DELETE `/org/service-providers/:providerId/buildings/:buildingId`

- Requires `service_providers.write`
- Removes the provider-building link

GET `/org/service-providers/:providerId/access-grants`

- Requires `service_providers.read`
- Returns provider-admin onboarding/access grants visible from the current org

POST `/org/service-providers/:providerId/access-grants`

- Requires `service_providers.write`
- Body: `{ email }`
- Creates the initial provider-admin invite and provider admin membership

POST `/org/service-providers/:providerId/access-grants/:grantId/resend-invite`

- Requires `service_providers.write`
- Re-sends the onboarding invite for a pending provider access grant

POST `/org/service-providers/:providerId/access-grants/:grantId/disable`

- Requires `service_providers.write`
- Disables a pending or active provider access grant

## Building Assignments (building-scoped)

POST `/org/buildings/:buildingId/assignments`

- Legacy write path removed in RBAC v2. Frontend should use `POST /users/:userId/access-assignments` with a building-scoped role template instead.
- Body: `{ userId, type: "MANAGER"|"STAFF"|"BUILDING_ADMIN" }`
- Requires `building.assignments.write`
- Building managers assigned to the building can create assignments.
- Creating a `BUILDING_ADMIN` assignment does not grant org-wide `admin`.

GET `/org/buildings/:buildingId/assignments`

- Requires `building.assignments.read`

DELETE `/org/buildings/:buildingId/assignments/:assignmentId`

- Legacy write path removed in RBAC v2. Frontend should use `DELETE /users/:userId/access-assignments/:assignmentId`.
- Requires `building.assignments.write`
- Removes a single building-scoped assignment record
- Does not affect org-wide access or resident linkage

## Occupancies (building-scoped)

POST `/org/buildings/:buildingId/occupancies`

- Body: `{ unitId, residentUserId }`
- Requires `occupancy.write`
- 409 if unit already occupied

GET `/org/buildings/:buildingId/occupancies`

- Requires `occupancy.read`

GET `/org/buildings/:buildingId/occupancies/count`

- Returns `{ active: number }`
- Requires `occupancy.read`

## Leases (org-scoped)

GET `/org/buildings/:buildingId/units/:unitId/lease/active`

- Returns the unit's active lease or `null`
- Requires `leases.read`

GET `/org/leases/:leaseId`

- Returns lease by id (org-scoped)
- Requires `leases.read`

GET `/org/leases`

- Returns paginated leases across all residents in the org (active and/or ended)
- Query:
  - `status=ACTIVE|ENDED|ALL` (default `ALL`)
  - `buildingId` (optional)
  - `unitId` (optional)
  - `residentUserId` (optional)
  - `q` (optional text search across resident name/email, unit label, building name)
  - `date_from` (optional, leaseStartDate lower bound inclusive, ISO datetime)
  - `date_to` (optional, leaseStartDate upper bound inclusive, ISO datetime)
  - `order=asc|desc` (by `leaseStartDate`, default `desc`)
  - `cursor`, `limit`
- Requires `leases.read`

GET `/org/residents/:userId/leases`

- Returns paginated lease list for a resident (active and/or ended)
- Query: `status=ACTIVE|ENDED|ALL` (default `ALL`), `order=asc|desc` (by `leaseStartDate`), `cursor`, `limit`
- Requires `leases.read`

GET `/org/residents/:userId/leases/timeline`

- Returns paginated lease history timeline across all resident leases
- Query: `action=CREATED|UPDATED|MOVED_OUT` (optional), `order=asc|desc` (by `createdAt`, default `desc`), `cursor`, `limit`
- Includes per item: `action`, `createdAt`, `changedByUser`, `changes`, and lease context (`leaseId`, `lease.status`, `leaseStartDate`, `leaseEndDate`, `buildingId`, `unitId`)
- Requires `leases.read`

GET `/org/leases/:leaseId/history`

- Returns full field-level lease change history (`CREATED`, `UPDATED`, `MOVED_OUT`)
- Requires `leases.read`

GET `/org/leases/:leaseId/timeline`

- Returns a unified timeline merged from field history + lease activity events
- Query:
  - `source=ALL|HISTORY|ACTIVITY` (default `ALL`)
  - `historyAction=CREATED|UPDATED|MOVED_OUT` (optional)
  - `activityAction=MOVE_IN|MOVE_OUT|DOCUMENT_ADDED|DOCUMENT_DELETED|ACCESS_CARD_ISSUED|ACCESS_CARD_STATUS_CHANGED|ACCESS_CARD_DELETED|PARKING_STICKER_ISSUED|PARKING_STICKER_STATUS_CHANGED|PARKING_STICKER_DELETED|OCCUPANTS_REPLACED|PARKING_ALLOCATED|PARKING_ALLOCATION_ENDED|VEHICLE_ADDED|VEHICLE_UPDATED|VEHICLE_DELETED` (optional)
  - `date_from` (optional, createdAt lower bound inclusive, ISO datetime)
  - `date_to` (optional, createdAt upper bound inclusive, ISO datetime)
  - `order=asc|desc` (default `desc`), `cursor`, `limit`
- Item shape includes: `source`, `action`, `createdAt`, `changedByUser`, `payload`
- Requires `leases.read`
- Parking/vehicle lease-context edits now emit lease activity:
  - allocation create -> `PARKING_ALLOCATED`
  - allocation end/end-all -> `PARKING_ALLOCATION_ENDED`
  - vehicle create/update/delete -> `VEHICLE_ADDED` / `VEHICLE_UPDATED` / `VEHICLE_DELETED`
- Occupancy-scoped parking/vehicle edit endpoints require both ACTIVE occupancy and ACTIVE lease; ended occupancy/lease returns 400.

PATCH `/org/leases/:leaseId`

- Partially updates editable lease fields
- Supports: `leaseStartDate`, `leaseEndDate`, `tenancyRegistrationExpiry`, `noticeGivenDate`, `annualRent`, `paymentFrequency`, `numberOfCheques`, `securityDepositAmount`, `internetTvProvider`, `serviceChargesPaidBy`, `vatApplicable`, `notes`, `firstPaymentReceived`, `firstPaymentAmount`, `depositReceived`, `depositReceivedAmount`
- Requires `leases.write`

## Contracts (org-scoped)

`/org/contracts/*` is the canonical contract API. `/org/leases/*` remains for backward compatibility.

Owner identity fields on contracts are legal snapshot data only (`ownerNameSnapshot`, `landlord*Snapshot`).
They are not live-linked to `Party`/`Owner` records and must not be treated as runtime owner identity.

POST `/org/buildings/:buildingId/contracts`

- Creates a draft contract for a unit + resident in the target building.
- Follows building-scoped write access.
- Access is allowed for users with global `contracts.write` or assigned `BUILDING_ADMIN` on that building.

GET `/org/contracts`

- Returns paginated contracts across the org.
- Requires `contracts.read`.

GET `/org/contracts/:contractId`

- Returns contract detail by id.
- Requires `contracts.read`.

PATCH `/org/contracts/:contractId`

- Partially updates editable contract fields.
- Requires `contracts.write`.
- Returns `409` when legal fields are edited on an ACTIVE contract that already has `ijariId`.

POST `/org/contracts/:contractId/activate`

- Transitions `DRAFT -> ACTIVE`.
- Requires `contracts.write`.

POST `/org/contracts/:contractId/cancel`

- Cancels the contract.
- If the contract is active and still has an active occupancy, the backend first ends that live occupancy/move-out state, then marks the contract `CANCELLED`.
- Also cancels any open move-in or move-out requests for that contract.
- Requires `contracts.write`.

PUT `/org/contracts/:contractId/additional-terms`

- Replaces additional terms for the contract.
- Requires `contracts.write`.

GET `/org/residents/:userId/contracts/latest`

- Returns the latest contract for a resident or `null`.
- Requires `contracts.read`.

GET `/org/buildings/:buildingId/move-in-requests`
GET `/org/buildings/:buildingId/move-out-requests`

- Lists move requests for a building.
- Query: `status=PENDING|APPROVED|REJECTED|CANCELLED|COMPLETED|ALL`
- Follows building-scoped read access for that building.
- Global `contracts.move_requests.review` is sufficient, but assigned building users can also access via building-scoped fallback rules.

POST `/org/move-in-requests/:requestId/approve`
POST `/org/move-in-requests/:requestId/reject`
POST `/org/move-out-requests/:requestId/approve`
POST `/org/move-out-requests/:requestId/reject`

- Requires `contracts.move_requests.review`.
- Sensitive review actions also require building linkage to the request's building.
- Building linkage means assigned `MANAGER` or `BUILDING_ADMIN` for that building.

POST `/org/contracts/:contractId/move-in/execute`

- Requires `contracts.move_in.execute`.
- Also requires building linkage to the contract's building (`MANAGER` or `BUILDING_ADMIN` assignment).

POST `/org/contracts/:contractId/move-out/execute`

- Requires `contracts.move_out.execute`.
- Also requires building linkage to the contract's building (`MANAGER` or `BUILDING_ADMIN` assignment).

## Residents (building-scoped)

POST `/org/buildings/:buildingId/residents`

- Body: `{ name, email, phone?, password?, sendInvite?, unitId }`
- Requires `residents.write`
- Creates User + ACTIVE Occupancy atomically
- Returns `{ userId, name, email, phone?, unit: { id, label }, buildingId, tempPassword?, inviteSent?, mustChangePassword: true }`
- 400 if unitId not in building, 409 if unit occupied
- Building managers assigned to the building can create residents.

## Residents (org-scoped)

POST `/org/residents`

- Body:
  ```
  {
    "user": {
      "name": "Resident Name",
      "email": "resident@org.com",
      "phone": "+971500000000",
      "password": "optional",
      "sendInvite": true
    },
    "profile": {}
  }
  ```
- `user.sendInvite` defaults to `true`.
- Returns include `inviteSent` and optional `tempPassword`.

POST `/org/residents/:userId/send-invite`

- Requires `residents.write`
- Reissues onboarding invite using setup-password flow (email purpose: resident invite).
- Resend is rate-limited per resident by cooldown window (default 60s). Too-soon resend returns `409 Conflict`.
- Invite email includes onboarding steps:
  - Set password
  - Download/open app
  - Submit move-in request in app
- Returns `{ success: true }`

GET `/org/residents/invites`

- Requires `residents.read`
- Query:
  - `status=ALL|PENDING|ACCEPTED|FAILED|EXPIRED` (default `ALL`)
  - `q` (resident name/email search)
  - `limit` (max 100, default 50)
  - `cursor` (pagination cursor)
- Status semantics:
  - `PENDING`: invite row `SENT` and not expired
  - `EXPIRED`: invite row `SENT` and expired
  - `FAILED`: invite row `FAILED`
  - `ACCEPTED`: invite row `ACCEPTED`
- Ordered by `sentAt desc, id desc`; cursor uses the same ordering.
- Response:
  - `items[]` with:
    - `inviteId`
    - `status` (`PENDING|ACCEPTED|FAILED|EXPIRED`)
    - `sentAt`, `expiresAt`, `acceptedAt?`, `failedAt?`, `failureReason?`
    - `user` (`id`, `email`, `name?`, `isActive`, `mustChangePassword`)
    - `createdByUser?` (`id`, `email`, `name?`)
  - `nextCursor?`

GET `/org/buildings/:buildingId/residents`

- Requires `residents.read`
- Returns list with: `{ userId, name, email, unit { id, label }, status, startAt, endAt }`

## Resident Profile (self)

GET `/resident/me`

- Returns the current user (including `avatarUrl` and phone if stored) and their ACTIVE occupancy (building + unit).
- `occupancy` is null when the user is not assigned to a unit.

PUT `/resident/me/profile`

- Body: resident profile fields from `UpsertResidentProfileDto`
  - `emiratesIdNumber?`, `passportNumber?`, `nationality?`, `dateOfBirth?`, `currentAddress?`, `emergencyContactName?`, `emergencyContactPhone?`, `preferredBuildingId?`
- Upserts the authenticated resident's own extended profile (self-service).
- Does not require org-wide `residents.profile.write`.

POST `/resident/me/avatar`

- Requires `resident.profile.write`
- Multipart form-data with required `file`
- Allowed mime types: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`
- Max size: `5 MB`
- Uploads the authenticated resident's avatar and updates `user.avatarUrl`
- Response:
  - `avatarUrl`

## Invite Deployment Notes

- Run migration before deploying app code:
  - `npm run prisma:migrate:deploy`
- Then deploy/restart backend with updated env.
- Optional env vars for onboarding invite app CTAs:
  - `MOBILE_APP_IOS_URL`
  - `MOBILE_APP_ANDROID_URL`
  - `MOBILE_APP_DEEP_LINK_URL`
- Optional resend cooldown env var:
  - `RESIDENT_INVITE_RESEND_COOLDOWN_SECONDS` (default `60`)
- Post-deploy smoke checks:
  - Create resident with `sendInvite=true`, verify onboarding subject/copy and link includes `mode=invite`.
  - Request forgot password, verify reset subject/copy and link includes `mode=reset`.
  - Call `GET /org/residents/invites?status=PENDING`, verify newly created invite appears.
  - Complete password setup via token, verify invite moves to `ACCEPTED`.

## Resident Lease & Parking (self)

GET `/resident/lease/active`

- Returns the current resident's active lease or `null`.
- Scoped to the authenticated user only.

GET `/resident/lease/active/documents`

- Returns documents for the current resident's active lease.
- Returns `[]` when no active lease exists.

GET `/resident/contracts/latest`

- Returns latest contract summary scoped to the authenticated resident only.
- Response shape:
  ```
  {
    "contract": { "...": "ContractResponseDto or null" },
    "canRequestMoveIn": false,
    "canRequestMoveOut": true,
    "latestMoveInRequestStatus": "PENDING|APPROVED|REJECTED|CANCELLED|COMPLETED|null",
    "latestMoveOutRequestStatus": "PENDING|APPROVED|REJECTED|CANCELLED|COMPLETED|null"
  }
  ```

GET `/resident/contracts/:contractId`

- Returns contract details for the authenticated resident.
- Response: `ContractResponseDto`
- Returns `404` if the contract does not exist.
- Access is limited to the resident who owns the contract.

GET `/resident/contracts`

- Returns paginated contracts for the authenticated resident (across statuses).
- Query:
  - `status=DRAFT|ACTIVE|ENDED|CANCELLED|ALL` (default `ALL`)
  - `order=asc|desc` (by contract start date, default `desc`)
  - `cursor`, `limit`
- Response: `{ items: ContractResponseDto[], nextCursor?: string | null }`

GET `/resident/contracts/:contractId/move-in-requests`
GET `/resident/contracts/:contractId/move-out-requests`

- Returns move request history for the authenticated resident and contract.
- Query: `status=PENDING|APPROVED|REJECTED|CANCELLED|COMPLETED|ALL` (optional)

POST `/resident/contracts/:contractId/documents/upload-url`

- Creates a presigned upload URL for resident contract document upload.
- Body:
  ```json
  {
    "type": "SIGNED_TENANCY_CONTRACT",
    "fileName": "signed-contract.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 123456
  }
  ```
- Response includes:
  - `uploadUrl` (presigned PUT URL)
  - `storageUrl` (`storage://...` key for final document create)
  - `objectKey`
  - `type`
  - `expiresInSeconds`

POST `/resident/contracts/:contractId/documents`

- Finalizes resident contract document metadata after upload.
- Body: `CreateLeaseDocumentDto`
- Resident uploads are restricted to `type=SIGNED_TENANCY_CONTRACT`.

GET `/resident/parking/active-allocation`

- Returns the current resident's most recent active parking allocation or `null`.
- Includes slot summary (`code`, `level`, `type`).

## Visitors (resident)

POST `/resident/visitors`

- Body: `{ type, visitorName, phoneNumber, emiratesId?, vehicleNumber?, expectedArrivalAt?, notes? }`
- Uses the resident's single ACTIVE occupancy to derive building/unit automatically
- Creates the visitor with status `EXPECTED`
- Returns `409 Conflict` if the resident has no active occupancy or more than one active occupancy

GET `/resident/visitors`

- Lists visitors for the resident's current occupied unit only
- Query: `status=EXPECTED|ARRIVED|COMPLETED|CANCELLED` (optional)

GET `/resident/visitors/:visitorId`

- Returns a visitor only if it belongs to the resident's current occupied unit

PATCH `/resident/visitors/:visitorId`

- Body: `{ type?, visitorName?, phoneNumber?, emiratesId?, vehicleNumber?, expectedArrivalAt?, notes? }`
- Residents cannot change `unitId`
- Residents cannot set workflow status here

POST `/resident/visitors/:visitorId/cancel`

- Cancels a visitor by setting status to `CANCELLED`
- Only allowed while the current status is `EXPECTED`

Resident visitor limitation:

- Visitor visibility is unit-scoped. If occupancy changes later, new active residents of that unit can see that unit's visitor records.

## Maintenance Requests (resident)

POST `/resident/requests`

- Body: `{ title, description?, type?, priority?, isEmergency?, emergencySignals?, attachments?: [{ fileName, mimeType, sizeBytes, url }] }`
- Uses resident ACTIVE occupancy to select building/unit
- Response now includes `requestTenancyContext`, using the active occupancy snapshot persisted at creation time when available
  - `type` values: `CLEANING` | `ELECTRICAL` | `MAINTENANCE` | `PLUMBING_AC_HEATING` | `OTHER`
  - `priority` values: `LOW` | `MEDIUM` | `HIGH`
  - `isEmergency` defaults to `false` when omitted
  - `emergencySignals` values: `ACTIVE_LEAK` | `NO_POWER` | `SAFETY_RISK` | `NO_COOLING`
  - if `emergencySignals` is present, backend treats the request as emergency intake even when `isEmergency` is omitted

GET `/resident/requests`

- Lists requests created by the resident (includes `attachments` when present)
- Each request now includes `requestTenancyContext`

GET `/resident/requests/:requestId`

- Get request detail (resident only)
- Includes `requestTenancyContext`

PATCH `/resident/requests/:requestId`

- Body: `{ title?, description?, type?, priority?, isEmergency?, emergencySignals? }`
- Only allowed while status is OPEN

POST `/resident/requests/:requestId/cancel`

- Cancels request unless already COMPLETED/CANCELED
- Returns the updated resident request including `requestTenancyContext`

POST `/resident/requests/:requestId/comments`

- Body: `{ message }`
- Residents always create `SHARED` comments
- Allowed until COMPLETED (CANCELED blocked)

GET `/resident/requests/:requestId/comments`

- Lists only `SHARED` comments for resident's request

## Maintenance Requests (building ops)

GET `/org/buildings/:buildingId/requests`

- Query: `status=OPEN|ASSIGNED|IN_PROGRESS|COMPLETED|CANCELED` (optional)
- Query: `ownerApprovalStatus=NOT_REQUIRED|PENDING|APPROVED|REJECTED` (optional)
- Query: `queue=NEW|NEEDS_ESTIMATE|AWAITING_ESTIMATE|AWAITING_OWNER|READY_TO_ASSIGN|ASSIGNED|IN_PROGRESS|OVERDUE` (optional)
- Requires `requests.read` OR building assignment read access
- STAFF without `requests.read` only sees requests assigned to them
- Includes `unit` (with `floor`), `createdBy`, `attachments` when present, `ownerApproval`, `policy`, computed `queue`, and provider assignment fields when set
- Includes `estimate` workflow state with:
  - `status = NOT_REQUESTED | REQUESTED | SUBMITTED`
  - `requestedAt`
  - `requestedByUserId`
  - `dueAt`
  - `reminderSentAt`
  - `submittedAt`
  - `submittedByUserId`

GET `/org/buildings/:buildingId/requests/:requestId`

- Same access rules as list
- Includes `unit` (with `floor`), `attachments` when present, `ownerApproval`, `policy`, computed `queue`, and provider assignment fields when set
- Includes the same `estimate` workflow block as list items

POST `/org/buildings/:buildingId/requests/:requestId/assign`

- Body: `{ staffUserId }`
- Requires `requests.assign` OR BUILDING_ADMIN assignment
- Building managers assigned to the building can assign requests.
- Allows re-assigning while status is `ASSIGNED`.
- Staff cannot assign
- Clears any existing provider assignment on the request

POST `/org/buildings/:buildingId/requests/:requestId/assign-provider`

- Body: `{ serviceProviderId }`
- Requires `requests.assign` OR BUILDING_ADMIN assignment
- Provider must be active and linked to the building
- Allows re-assigning while status is `ASSIGNED`
- Clears any internal staff assignment and any previously assigned provider worker
- Blocked while owner approval is `PENDING`

POST `/org/buildings/:buildingId/requests/:requestId/request-estimate`

- Body: `{ serviceProviderId }`
- Requires `requests.assign` OR BUILDING_ADMIN assignment
- Provider must be active and linked to the building
- Allowed only while backend policy route is `NEEDS_ESTIMATE`
- Links the request to a provider without moving it into execution
- Keeps request status as `OPEN` while the primary queue becomes `AWAITING_ESTIMATE`
- Sets `estimate.status = REQUESTED`
- Stamps `estimate.requestedAt` and `estimate.requestedByUserId`
- Sets `estimate.dueAt` using the backend estimate SLA window
- Clears any internal staff assignment and any previously assigned provider worker

POST `/org/buildings/:buildingId/requests/:requestId/assign-provider-worker`

- Body: `{ userId }`
- Requires `requests.assign` OR BUILDING_ADMIN assignment
- Request must already be assigned to a provider
- User must be an active member of the assigned provider
- Keeps request status as `ASSIGNED`

POST `/org/buildings/:buildingId/requests/:requestId/unassign-provider`

- Requires `requests.assign` OR BUILDING_ADMIN assignment
- Removes provider and provider-worker assignment
- Reopens the request to `OPEN`
- Blocked while owner approval is `PENDING`

POST `/org/buildings/:buildingId/requests/:requestId/status`

- Body: `{ status: "IN_PROGRESS" | "COMPLETED" }`
- STAFF allowed only when assigned to the request
- Managers allowed
- BUILDING_ADMIN allowed

POST `/org/buildings/:buildingId/requests/:requestId/cancel`

- Cancels a request (blocked if COMPLETED/CANCELED)
- STAFF cannot cancel

POST `/org/buildings/:buildingId/requests/:requestId/attachments`

- Body: `{ attachments: [{ fileName, mimeType, sizeBytes, url }] }`
- Adds attachments to the request (blocked if COMPLETED/CANCELED)
- Same access rules as comments (staff only if assigned)

POST `/org/buildings/:buildingId/requests/:requestId/comments`
GET `/org/buildings/:buildingId/requests/:requestId/comments`

- Managers/BUILDING_ADMIN can comment
- STAFF only if assigned to the request
- Org admins rely on `requests.comment` when not assigned
- Building comment body:
  - `message`
  - `visibility? = SHARED | INTERNAL`
- Building comments default to `SHARED`
- `INTERNAL` comments stay visible only to org/building ops and are not exposed on resident or owner comment endpoints

GET `/org/buildings/:buildingId/requests/comments/unread-count`

- Returns `{ unreadCount }`
- Counts unread request comments across the current user's visible requests in that building
- For building ops, both `SHARED` and `INTERNAL` comments count when visible to the caller
- Staff-only users count only comments on requests currently assigned to them
- Reading `GET /org/buildings/:buildingId/requests/:requestId/comments` marks that request's visible comments as read for the caller

POST `/org/buildings/:buildingId/requests/:requestId/owner-approval/require`

- Requires `requests.assign`
- Marks owner approval as required and moves request owner approval state to `PENDING`
- Body:
  - `approvalRequiredReason`
  - `estimatedAmount?`
  - `estimatedCurrency?`
  - `isEmergency?`
  - `isLikeForLike?`
  - `isUpgrade?`
  - `isMajorReplacement?`
  - `isResponsibilityDisputed?`
  - `ownerApprovalDeadlineAt?`
- Blocked for closed requests and requests with no `unitId`

POST `/org/buildings/:buildingId/requests/:requestId/owner-approval/request`

- Requires `requests.assign`
- Allowed only while owner approval state is `PENDING`
- Stamps `ownerApproval.requestedAt` and `ownerApproval.requestedByUserId`
- Fails if owner approval was already requested; use resend instead

POST `/org/buildings/:buildingId/requests/:requestId/owner-approval/request-now`

- Requires `requests.assign`
- Atomic V1 helper for the one-button management flow
- In one transaction it:
  - marks owner approval required
  - stores any supplied triage/estimate fields
  - stamps `ownerApproval.requestedAt`
  - stamps `ownerApproval.requestedByUserId`
- Body:
  - `approvalRequiredReason`
  - `estimatedAmount?`
  - `estimatedCurrency?`
  - `isEmergency?`
  - `isLikeForLike?`
  - `isUpgrade?`
  - `isMajorReplacement?`
  - `isResponsibilityDisputed?`
  - `ownerApprovalDeadlineAt?`

POST `/org/buildings/:buildingId/requests/:requestId/policy-triage`

- Requires `requests.assign`
- Updates management triage/policy inputs without starting owner approval
- Body:
  - `estimatedAmount?`
  - `estimatedCurrency?`
  - `isEmergency?`
  - `isLikeForLike?`
  - `isUpgrade?`
  - `isMajorReplacement?`
  - `isResponsibilityDisputed?`
- At least one field is required
- Returns the same building request detail payload, including recomputed `policy` and `queue`

POST `/org/buildings/:buildingId/requests/:requestId/estimate`

- Requires `requests.assign`
- Stores estimate facts and re-runs backend policy evaluation
- Body:
  - `estimatedAmount`
  - `estimatedCurrency?`
  - `approvalRequiredReason?`
  - `isEmergency?`
  - `isLikeForLike?`
  - `isUpgrade?`
  - `isMajorReplacement?`
  - `isResponsibilityDisputed?`
  - `ownerApprovalDeadlineAt?`
- If the estimate still qualifies for direct dispatch, owner approval state is cleared back to `NOT_REQUIRED`
- If the estimate requires owner approval and the request is linked to a unit, backend automatically moves owner approval to `PENDING` and stamps `requestedAt` / `requestedByUserId`
- Sets `estimate.status = SUBMITTED`
- Stamps `estimate.submittedAt` and `estimate.submittedByUserId`
- Returns the same building request detail payload, including recomputed `policy` and `queue`

POST `/org/buildings/:buildingId/requests/:requestId/owner-approval/resend`

- Requires `requests.assign`
- Allowed only while owner approval state is `PENDING`
- Fails unless an earlier owner approval request was already sent

POST `/org/buildings/:buildingId/requests/:requestId/owner-approval/override`

- Requires `requests.owner_approval_override`
- Allowed only while owner approval state is `PENDING`
- Body:
  - `decisionSource = MANAGEMENT_OVERRIDE | EMERGENCY_OVERRIDE`
  - `ownerApprovalOverrideReason`
- `MANAGEMENT_OVERRIDE` is allowed only after `ownerApprovalDeadlineAt` has passed
- `EMERGENCY_OVERRIDE` is allowed immediately
- Successful override approves the request for execution and records override audit metadata

## Maintenance Requests (service provider)

GET `/provider/requests`

- Lists requests assigned to one of the current user's active service provider memberships
- Query:
  - `status=OPEN|ASSIGNED|IN_PROGRESS|COMPLETED|CANCELED` (optional)
  - `serviceProviderId=<uuid>` (optional, must be one of the caller's active provider memberships)
- Returns provider-facing request detail including `buildingName`, `unit`, `createdBy`, `serviceProvider`, `serviceProviderAssignedTo`, `attachments`, `ownerApproval`, `requesterContext`, and `requestTenancyContext`
- `requestTenancyContext` returns:
  - `occupancyIdAtCreation`
  - `leaseIdAtCreation`
  - `currentOccupancyId`
  - `currentLeaseId`
  - `isCurrentOccupancy`
  - `isCurrentLease`
  - `label = CURRENT_OCCUPANCY | PREVIOUS_OCCUPANCY | NO_ACTIVE_OCCUPANCY | UNKNOWN_TENANCY_CYCLE`
  - `leaseLabel = CURRENT_LEASE | PREVIOUS_LEASE | NO_ACTIVE_LEASE | UNKNOWN_LEASE_CYCLE`
  - `tenancyContextSource = SNAPSHOT | HISTORICAL_INFERENCE | UNRESOLVED`
  - `leaseContextSource = SNAPSHOT | HISTORICAL_INFERENCE | UNRESOLVED`
- `UNKNOWN_*` now represents unresolved legacy context only, not a generic fallback for active requests

GET `/provider/requests/:requestId`

- Returns one request only when it is assigned to one of the caller's active service provider memberships
- Returns `404` for unrelated provider requests

POST `/provider/requests/:requestId/assign-worker`

- Body: `{ userId }`
- Provider admins only
- Request must already be assigned to that provider
- User must be an active member of the same provider

POST `/provider/requests/:requestId/status`

- Body: `{ status: "IN_PROGRESS" | "COMPLETED" }`
- Provider admins can update any request for their provider
- Provider workers can update only when they are the assigned provider worker
- Blocked while owner approval is still execution-blocking

POST `/provider/requests/:requestId/estimate`

- Body:
  - `estimatedAmount`
  - `estimatedCurrency?`
  - `approvalRequiredReason?`
  - `isEmergency?`
  - `isLikeForLike?`
  - `isUpgrade?`
  - `isMajorReplacement?`
  - `isResponsibilityDisputed?`
  - `ownerApprovalDeadlineAt?`
- Provider admins can submit an estimate on any request for their provider
- Provider workers can submit an estimate only when they are the assigned provider worker
- Backend re-runs policy from the estimate facts
- If owner approval is not needed after re-evaluation, owner approval state is cleared back to `NOT_REQUIRED`
- If owner approval is required and the request is linked to a unit, backend automatically moves owner approval to `PENDING` and stamps `requestedAt` / `requestedByUserId`
- Sets `estimate.status = SUBMITTED`
- Stamps `estimate.submittedAt` and `estimate.submittedByUserId`

POST `/provider/requests/:requestId/comments`
GET `/provider/requests/:requestId/comments`

- Provider comments are always stored as `SHARED`
- Provider admins can comment on any request for their provider
- Provider workers can comment only when they are the assigned provider worker
- Provider comment reads only return `SHARED` comments and hide building `INTERNAL` comments

GET `/provider/requests/comments/unread-count`

- Returns `{ unreadCount }`
- Counts unread `SHARED` comments across requests assigned to one of the caller's active provider memberships
- `INTERNAL` building comments never count for provider users because they are not visible on provider comment reads
- Reading `GET /provider/requests/:requestId/comments` marks that request's visible provider comments as read for the caller

POST `/provider/requests/:requestId/attachments`

- Body: `{ attachments: [{ fileName, mimeType, sizeBytes, url }] }`
- Provider admins can add attachments on any request for their provider
- Provider workers can add attachments only when they are the assigned provider worker
- Blocked for `COMPLETED` or `CANCELED` requests
- Notification behavior:
  - assigning a request to a provider notifies active provider admins
  - dispatching a provider worker notifies that worker
  - provider completion continues to notify building-side recipients through the standard maintenance status notification path

## Messaging

GET `/resident/messages/management-contacts`

- Lists the allowed management contacts for the authenticated resident's active building
- Requires `messaging.write`
- Uses the resident's active occupancy to determine the building automatically
- Returns only management contacts currently eligible for resident-to-management messaging in that building
- Returns `409 Conflict` if the resident has no active occupancy

POST `/resident/messages/management`

- Creates a conversation from the authenticated resident to management for the resident's active building.
- Body:
  ```json
  {
    "managementUserId": "uuid",
    "subject": "Optional subject",
    "message": "Initial message content"
  }
  ```
- Requires `messaging.write`
- Uses the resident's active occupancy to determine the building automatically
- If `managementUserId` is omitted, targets every currently eligible management participant for that building
- If `managementUserId` is provided, creates a private conversation with that selected allowed management contact only
- Returns `403 Forbidden` when `managementUserId` is not an allowed management contact for the resident's active building
- Returns `409 Conflict` if the resident has no active occupancy or no management users are assigned to that building

POST `/resident/messages/owner`

- Creates a private conversation from the authenticated resident to the current owner of the resident's active unit
- Body:
  ```json
  {
    "subject": "Optional subject",
    "message": "Initial message content"
  }
  ```
- Requires `messaging.write`
- Uses the resident's active occupancy to determine the unit and building automatically
- Resolves the current owner from the active unit ownership row, with fallback to `Unit.ownerId` only when no active ownership row exists
- Allowed only when:
  - the resident has an active occupancy in the current org
  - the unit has a current active owner
  - that owner has an active owner access grant linked to a user
- Returns `409 Conflict` if the resident has no active occupancy or no active owner user is assigned to that unit

POST `/owner/messages/management`

- Creates a private conversation from the authenticated owner to management for one currently accessible unit
- Body:
  ```json
  {
    "unitId": "uuid",
    "subject": "Optional subject",
    "message": "Initial message content"
  }
  ```
- Uses owner runtime access, not org RBAC
- Allowed only when:
  - owner grant remains `ACTIVE`
  - owner record remains active
  - `unitId` is inside the owner's current accessible unit scope
- Targets assigned management users for the selected unit's building
- Returns `409 Conflict` if no management users are assigned to that building

POST `/owner/messages/tenants`

- Creates a private conversation from the authenticated owner to a tenant
- Body:
  ```json
  {
    "unitId": "uuid",
    "tenantUserId": "uuid",
    "subject": "Optional subject",
    "message": "Initial message content"
  }
  ```
- Uses owner runtime access, not org RBAC
- Allowed only when:
  - owner grant remains `ACTIVE`
  - owner record remains active
  - `unitId` is inside the owner's current accessible unit scope
  - `tenantUserId` is an active resident of that same unit
- Owners cannot use this path to browse or message unrelated tenants

GET `/org/conversations`

- Lists only conversations where the current user is an explicit participant inside the current org
- Query: `type` (optional), `counterpartyGroup` (optional), `cursor` (optional), `limit` (optional)
- Each item returns:
  - `id`
  - `type = MANAGEMENT_INTERNAL | MANAGEMENT_TENANT | MANAGEMENT_OWNER | OWNER_TENANT`
  - `counterpartyGroup = STAFF | TENANT | OWNER | MIXED`
  - `subject`
  - `buildingId`
  - `participants`
  - `unreadCount`
  - `lastMessage`
  - `createdAt`
  - `updatedAt`

GET `/org/conversations/unread-count`

- Returns `{ unreadCount }`
- Counts unread messages across all org-scoped conversations where the caller is a participant

GET `/org/conversations/:id`

- Returns conversation detail only when the current user is an explicit participant in the current org

POST `/org/conversations/:id/messages`

- Sends a message only when the current user is an explicit participant in the conversation
- Body: `{ content }`

POST `/org/conversations/:id/read`

- Marks the conversation as read for the current user
- Returns `{ success: true }`

GET `/owner/conversations`

- Lists only conversations where the current owner user is an explicit participant
- Does not depend on org RBAC or `OrgScopeGuard`
- Supports the same `type`, `counterpartyGroup`, `cursor`, and `limit` pagination pattern as org conversations
- Each item returns:
  - `id`
  - `orgId`
  - `orgName`
  - `type = MANAGEMENT_INTERNAL | MANAGEMENT_TENANT | MANAGEMENT_OWNER | OWNER_TENANT`
  - `counterpartyGroup = STAFF | TENANT | OWNER | MIXED`
  - `subject`
  - `buildingId`
  - `buildingName`
  - `participants`
  - `unreadCount`
  - `lastMessage`
  - `createdAt`
  - `updatedAt`

GET `/owner/conversations/unread-count`

- Returns `{ unreadCount }`
- Counts unread messages across all owner-visible conversations where the caller is a participant

GET `/owner/conversations/:id`

- Returns owner conversation detail only when the current owner user is an explicit participant
- Returns `404` for non-participants

POST `/owner/conversations/:id/messages`

- Sends a message only when the current owner user is an explicit participant
- Body: `{ content }`

POST `/owner/conversations/:id/read`

- Marks the conversation as read only when the current owner user is an explicit participant
- Returns `{ success: true }`

### Owner Private Messaging Rules

- Creation uses current owner unit scope:
  - management conversations require an accessible `unitId`
  - tenant conversations require an accessible `unitId` and an active tenant occupancy in that same unit
- Ongoing private-conversation visibility is by explicit participant membership only
- Owners cannot browse an org-wide tenant directory through messaging endpoints
- Owners cannot view, send, or mark read for conversations they are not a participant in
- This shipped slice is private messaging only; request-linked messaging is still deferred

### Resident Private Messaging Rules

- Resident creation uses the caller's active occupancy only:
  - management conversations target the caller's current building management users
  - owner conversations target the current owner of the caller's active unit
- Residents cannot choose an arbitrary owner through messaging routes
- Ongoing private-conversation visibility is by explicit participant membership only
- This shipped slice is private messaging only; request-linked messaging is still deferred

## Notifications

GET `/notifications`

- Query: `unreadOnly=true` (optional), `includeDismissed=true` (optional), `type=BROADCAST|REQUEST_CREATED|REQUEST_ASSIGNED|REQUEST_STATUS_CHANGED|REQUEST_COMMENTED|REQUEST_CANCELED|VISITOR_ARRIVED|CONVERSATION_CREATED|MESSAGE_CREATED` (optional), `cursor` (optional), `limit` (optional)
- Returns: `{ items: [{ id, type, title, body?, data, readAt?, dismissedAt?, createdAt }], nextCursor? }`
- `limit` defaults to 20, max 100
- Cursor format: base64 of `${createdAt.toISOString()}|${id}`
- Only returns notifications for the current user and org.

GET `/notifications/unread-count`

- Returns `{ unreadCount }`
- Counts only unread, non-dismissed notifications for the current user and org

POST `/notifications/:id/read`

- Marks a single notification as read
- Returns `{ success: true }`
- 404 if the notification is not owned by the user/org

GET `/owner/notifications`

- Query: `unreadOnly=true` (optional), `includeDismissed=true` (optional), `type=BROADCAST|REQUEST_CREATED|REQUEST_ASSIGNED|REQUEST_STATUS_CHANGED|REQUEST_COMMENTED|REQUEST_CANCELED|VISITOR_ARRIVED|CONVERSATION_CREATED|MESSAGE_CREATED` (optional), `cursor` (optional), `limit` (optional)
- Returns: `{ items: [{ id, orgId, type, title, body?, data, readAt?, dismissedAt?, createdAt }], nextCursor? }`
- Reads across every org currently reachable through the caller's active owner grants

GET `/owner/notifications/unread-count`

- Returns `{ unreadCount }`
- Counts only unread, non-dismissed notifications across every org currently reachable through the caller's active owner grants

POST `/owner/notifications/:id/read`

- Marks one owner-visible notification as read across the caller's current owner org scope
- Returns `{ success: true }`

POST `/owner/notifications/read-all`

- Marks all unread owner-visible notifications as read across the caller's current owner org scope
- Returns `{ success: true }`

POST `/owner/notifications/:id/dismiss`

- Dismisses one owner-visible notification across the caller's current owner org scope
- Returns `{ success: true }`

POST `/owner/notifications/:id/undismiss`

- Restores one dismissed owner-visible notification across the caller's current owner org scope
- Returns `{ success: true }`

GET `/owner/me`

- Returns the current owner runtime account plus every accessible org-local owner profile
- Uses owner runtime access, not org RBAC
- Requires:
  - authenticated user
  - at least one active owner access grant

PATCH `/owner/me/profile`

- Updates the current owner runtime account fields
- Body: `{ name?, avatarUrl?, phone? }`
- Intended for account-level profile edits such as display name, picture, and personal phone
- Uses owner runtime access, not org RBAC

PATCH `/owner/profiles/:ownerId`

- Updates one org-local owner profile inside the caller's current owner access scope
- Body: `{ email?, phone?, address? }`
- Returns `404` if `ownerId` is not inside the caller's active owner access scope
- Uses owner runtime access, not org RBAC

## Owner Portfolio

GET `/owner/portfolio/units`

- Read-only owner portfolio units view across all active owner grants
- Uses owner runtime access, not org RBAC
- Runtime access requires:
  - authenticated user
  - active owner access grant
  - active owner record
  - unit scope resolved from active `UnitOwnership` rows
  - temporary fallback to `Unit.ownerId` only when no active `UnitOwnership` row exists for that unit during migration
- Each row returns exactly:
  - `orgId`
  - `orgName`
  - `ownerId`
  - `unitId`
  - `buildingId`
  - `buildingName`
  - `unitLabel`

GET `/owner/portfolio/units/:unitId/tenant`

- Returns the current active tenant for one unit inside the caller's current owner scope
- Returns `404` when the unit is outside the current owner scope
- Returns `null` when the unit is accessible but currently vacant
- Intended for owner-safe tenant discovery before `POST /owner/messages/tenants`
- Returns exactly:
  - `occupancyId`
  - `tenantUserId`
  - `name`
  - `email`
  - `phone`

GET `/owner/portfolio/summary`

- Read-only owner portfolio summary
- Uses the same scope logic as `/owner/portfolio/units`
- Returns exactly:
  - `unitCount`
  - `orgCount`
  - `buildingCount`

GET `/owner/portfolio/requests`

- Read-only owner portfolio maintenance requests across the same current owner unit scope used by `/owner/portfolio/units`
- Runtime access requires:
  - authenticated user
  - active owner access grant
  - active owner record
  - request `unitId` still inside current owner scope
- Returns each request with:
  - `id`
  - `orgId`
  - `orgName`
  - `ownerId`
  - `buildingId`
  - `buildingName`
  - `unit`
  - `createdBy`
  - `assignedTo`
  - `title`
  - `description`
  - `status`
  - `priority`
  - `type`
  - `attachments`
  - `requesterContext`
  - `requestTenancyContext`
  - `ownerApproval`
  - `createdAt`
  - `updatedAt`
- `requestTenancyContext` returns:
  - `occupancyIdAtCreation`
  - `leaseIdAtCreation`
  - `currentOccupancyId`
  - `currentLeaseId`
  - `isCurrentOccupancy`
  - `isCurrentLease`
  - `label = CURRENT_OCCUPANCY | PREVIOUS_OCCUPANCY | NO_ACTIVE_OCCUPANCY | UNKNOWN_TENANCY_CYCLE`
  - `leaseLabel = CURRENT_LEASE | PREVIOUS_LEASE | NO_ACTIVE_LEASE | UNKNOWN_LEASE_CYCLE`
  - `tenancyContextSource = SNAPSHOT | HISTORICAL_INFERENCE | UNRESOLVED`
  - `leaseContextSource = SNAPSHOT | HISTORICAL_INFERENCE | UNRESOLVED`
- Frontends should treat:
  - `CURRENT_OCCUPANCY` as operational current-cycle work
  - `PREVIOUS_OCCUPANCY` and `NO_ACTIVE_OCCUPANCY` as historical
  - `UNKNOWN_TENANCY_CYCLE` with `tenancyContextSource = UNRESOLVED` as unresolved legacy context

GET `/owner/portfolio/requests/comments/unread-count`

- Returns `{ unreadCount }`
- Counts unread `SHARED` comments across the caller's currently accessible owner-scope requests
- Owner-authored comments do not count as unread
- Reading `GET /owner/portfolio/requests/:requestId/comments` marks the visible comments on that request as read for the caller

GET `/owner/portfolio/requests/:requestId`

- Read-only owner request detail
- Returns `404` when the request is outside the current owner scope

POST `/owner/portfolio/requests/:requestId/approve`

- Owner-only action
- Allowed only when:
  - owner grant remains `ACTIVE`
  - owner record remains active
  - request unit remains inside current owner scope
  - `ownerApproval.status = PENDING`
- Body: `{ approvalReason? }`
- Sets:
  - `ownerApproval.status = APPROVED`
  - `ownerApproval.decisionSource = OWNER`
  - `ownerApproval.decidedAt`
  - `ownerApproval.decidedByOwnerUserId`

POST `/owner/portfolio/requests/:requestId/reject`

- Owner-only action
- Same scope rules as approve
- Allowed only when `ownerApproval.status = PENDING`
- Body: `{ approvalReason }`
- Sets:
  - `ownerApproval.status = REJECTED`
  - `ownerApproval.decisionSource = OWNER`
  - `ownerApproval.decidedAt`
  - `ownerApproval.decidedByOwnerUserId`

GET `/owner/portfolio/requests/:requestId/comments`

- Owner-only request comments read endpoint
- Allowed only when:
  - owner grant remains `ACTIVE`
  - owner record remains active
  - request unit remains inside current owner scope
- Returns only `SHARED` comments

POST `/owner/portfolio/requests/:requestId/comments`

- Owner-only request comments write endpoint
- Same scope rules as owner request read/detail
- Body: `{ message }`
- Owner comments are always stored as:
  - `author.type = OWNER`
  - `visibility = SHARED`

### Owner Approval Rules

- `ownerApproval` returns exactly:
  - `status`
  - `requestedAt`
  - `requestedByUserId`
  - `deadlineAt`
  - `decidedAt`
  - `decidedByOwnerUserId`
  - `reason`
  - `requiredReason`
  - `estimatedAmount`
  - `estimatedCurrency`
  - `decisionSource`
  - `overrideReason`
  - `overriddenByUserId`
- Building request detail/list additionally returns:
  - `estimate.status = NOT_REQUESTED | REQUESTED | SUBMITTED`
  - `estimate.requestedAt`
  - `estimate.requestedByUserId`
  - `estimate.submittedAt`
  - `estimate.submittedByUserId`
  - `policy.isEmergency`
  - `policy.isLikeForLike`
  - `policy.isUpgrade`
  - `policy.isMajorReplacement`
  - `policy.isResponsibilityDisputed`
  - `policy.route = DIRECT_ASSIGN | EMERGENCY_DISPATCH | NEEDS_ESTIMATE | OWNER_APPROVAL_REQUIRED`
  - `policy.recommendation = PROCEED_NOW | GET_ESTIMATE | REQUEST_OWNER_APPROVAL | PROCEED_AND_NOTIFY`
  - `queue = NEW | NEEDS_ESTIMATE | AWAITING_ESTIMATE | AWAITING_OWNER | READY_TO_ASSIGN | ASSIGNED | IN_PROGRESS | OVERDUE | null`
- `ownerApproval.status` values:
  - `NOT_REQUIRED`
  - `PENDING`
  - `APPROVED`
  - `REJECTED`
- `PENDING` blocks assignment and execution progression
- `REJECTED` keeps the request visible but execution-blocked
- `APPROVED` unlocks assignment and execution progression
- Audit rows are recorded for require, request, resend, approve, reject, and override actions

### Request Comment Rules

- Comment response includes:
  - `id`
  - `requestId`
  - `author` with `id`, `name`, `email`, `type`, `ownerId`
  - `message`
  - `visibility`
  - `createdAt`
- Comment author types:
  - `OWNER`
  - `TENANT`
  - `STAFF`
  - `SYSTEM`
- Comment visibility values:
  - `SHARED`
  - `INTERNAL`
- Owners can read and add only `SHARED` comments
- Residents can read only `SHARED` comments and create only `SHARED` comments
- Building ops can create either `SHARED` or `INTERNAL` comments
- If ownership changes, the old owner loses request comment access immediately

### Explicitly Not Shipped In Owner Request Slice

- owner maintenance request creation
- owner request attachments upload
- request-linked messaging

POST `/notifications/:id/dismiss`

- Hides a single notification for the current user
- Returns `{ success: true }`
- 404 if the notification is not owned by the user/org

POST `/notifications/:id/undismiss`

- Restores a dismissed notification for the current user
- Returns `{ success: true }`
- 404 if the notification is not owned by the user/org

POST `/notifications/read-all`

- Marks all unread notifications for the user as read
  - Returns `{ success: true }`

POST `/notifications/push-devices/register`

- Registers or re-activates the current device push token for the authenticated user.
- Body:
  ```json
  {
    "provider": "EXPO",
    "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "platform": "IOS",
    "deviceId": "optional-stable-device-id",
    "appId": "optional-app-identifier"
  }
  ```
- Returns the stored device record.

POST `/notifications/push-devices/unregister`

- Deactivates the current device push token for the authenticated user.
- Body:
  ```json
  {
    "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
  }
  ```
- Returns `{ success: true }`

POST `/owner/notifications/devices`

- Registers or re-activates a push device for an authenticated owner user without requiring org scope.
- Uses the same body shape as `/notifications/push-devices/register`.
- Stores the device without binding it to a single org notification endpoint.
- Returns the stored device record.

PATCH `/owner/notifications/devices/:deviceId`

- Updates an owner push device by id.
- Any subset of the registration fields may be supplied.
- Re-activates the device and refreshes `lastSeenAt`.
- Returns the updated device record.

DELETE `/owner/notifications/devices/:deviceId`

- Deactivates an owner push device by id.
- Returns `{ success: true }`

Notification types (maintenance requests):

- `REQUEST_CREATED`
- `REQUEST_ASSIGNED`
- `REQUEST_STATUS_CHANGED`
- `REQUEST_COMMENTED`
- `REQUEST_CANCELED`
- `BROADCAST`
- `CONVERSATION_CREATED`
- `MESSAGE_CREATED`

Push delivery:

- Stored notifications also trigger remote push when `PUSH_PROVIDER=expo` and the user has a registered active device token.
- Owner push delivery is resolved against the notification org at send time using current active owner grants.
- Disabled owner grants, inactive owners, and same-party records in other orgs without a separate grant do not receive future push delivery.
- Chat notifications are stored first, and that stored-notification path owns remote push delivery for new conversations and messages.

Notification `data` payload includes:

- `requestId`, `buildingId`, `unitId`, `actorUserId`
- optional: `status`, `commentId`

## Org Profile

GET `/org/profile`

- Returns `{ id, name, logoUrl, businessName?, businessType?, tradeLicenseNumber?, vatRegistrationNumber?, registeredOfficeAddress?, city?, officePhoneNumber?, businessEmailAddress?, website?, ownerName? }`
- Any authenticated user in the org

PATCH `/org/profile`

- Body:
  ```
  {
    "name": "Towerdesk Inc.",
    "logoUrl": "https://example.com/logo.png",
    "businessName": "Towerdesk Management LLC",
    "businessType": "PROPERTY_MANAGEMENT",
    "tradeLicenseNumber": "TL-12345",
    "vatRegistrationNumber": "VAT-12345",
    "registeredOfficeAddress": "123 Main St",
    "city": "Dubai",
    "officePhoneNumber": "+971-4-555-0100",
    "businessEmailAddress": "info@towerdesk.com",
    "website": "https://towerdesk.com",
    "ownerName": "Jane Founder"
  }
  ```
- Requires `org.profile.write`

## User Profile (self)

PATCH `/users/me/profile`

- Body: `{ name?, avatarUrl?, phone? }`
- Updates only the current user

POST `/users/me/avatar`

- Multipart form-data with required `file`
- Allowed mime types: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`
- Max size: `5 MB`
- Uploads the authenticated user's avatar and updates `user.avatarUrl`
- Response:
  - `avatarUrl`

Cloudinary unsigned upload (frontend):

1. Upload directly to Cloudinary using your own cloud name and unsigned preset.
2. Use the returned `secure_url` as `logoUrl` or `avatarUrl`.

## Error codes quick reference

- 400: bad request / validation error (e.g., unit mismatch)
- 401: unauthenticated
- 403: org scope missing or insufficient permissions (in-org)
- 404: cross-org resource not found
- 409: conflict (e.g., unit already occupied, duplicate)

## Frontend integration checklist

- Use `GET /org/unit-types` (org-scoped) for unit type dropdowns.
- Use `GET /org/owners` (org-scoped) for owner dropdowns/search.
- Use `GET /org/buildings/:buildingId/amenities` (building-scoped) for amenity options.
- `POST /org/buildings/:buildingId/units` accepts `amenityIds`.
  - Omit `amenityIds` to auto-apply active defaults (`isDefault=true`).
  - Send `amenityIds: []` to intentionally assign none.
- `GET /org/buildings/:buildingId/units/:unitId` returns `amenityIds` and `amenities`.
- Unit list and `/basic` remain minimal (no amenities).
- Decimal fields in unit responses are strings (`"120000"`), not numbers.
