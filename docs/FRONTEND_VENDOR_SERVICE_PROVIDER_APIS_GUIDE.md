# Frontend Handoff: Service Provider Directory + Provider Portal

Use this file as the implementation source of truth for the current service-provider backend.

This guide is written for a frontend agent that needs to ship fast without rereading backend code.

It covers:

- org management flows under `/org/*`
- provider portal flows under `/provider/*`
- provider request handling under `/provider/requests/*`

## Base

- API prefix: `/api` if your gateway prefixes Nest routes.
- Auth: `Authorization: Bearer <accessToken>`.
- Management routes are org-scoped and require org-scoped permissions.
- Provider portal routes are not org-scoped. They resolve access from active provider memberships.
- Provider-managed accounts reuse `User` with `orgId = null`.
- Providers are global directory records. They are not tenant orgs.

## What Frontend Should Build First

### Phase 1: Org Management

1. Provider directory list
2. Provider detail
3. Create provider
4. Link and unlink buildings
5. Invite initial provider admin
6. Resend and disable provider admin access
7. Assign provider on maintenance request
8. Assign provider worker on maintenance request

### Phase 2: Provider Portal

1. Resolve provider runtime context with `GET /provider/me`
2. Provider profile view/edit
3. Provider staff list
4. Create provider staff
5. Activate/deactivate provider staff
6. Change staff role between `ADMIN` and `WORKER`
7. Provider request queue
8. Provider request detail, comments, attachments
9. Provider worker dispatch and request status updates

## Hard Product Rules

- A provider is one global shared directory record.
- The same provider can be linked to buildings across multiple orgs.
- Org management can manage links and the initial provider-admin invite.
- Org management does not manage provider workers directly.
- Once the provider has at least one active provider-admin grant, the shared provider profile is provider-owned.
- After provider ownership starts, org-side profile editing should be disabled.
- Provider staff roles are only `ADMIN` and `WORKER`.
- Internal staff assignment and provider assignment are mutually exclusive on a maintenance request.
- Assigning a provider clears internal staff assignment.
- Assigning internal staff later clears provider assignment and provider-worker assignment.
- Assigning a provider worker requires the request to already be assigned to a provider.
- Provider worker must be an active membership of that same provider.
- Provider admins can act across all requests for their provider.
- Provider workers can read provider requests for their provider but can only mutate requests assigned to them.

## Important Runtime Constraint

`GET /provider/me` can return multiple accessible providers for one user.

But all current provider-portal write and detail routes assume a single active provider context.

That means:

- if the user has zero active accessible provider memberships, provider routes return `403`
- if the user has multiple active accessible provider memberships, most `/provider/*` routes can return `409`
- the current backend does not yet support passing a `providerId` selector to `/provider/profile` or `/provider/staff`

Frontend implication:

- build `GET /provider/me` first
- if `providers.length === 0`, show "no provider access"
- if `providers.length === 1`, proceed normally
- if `providers.length > 1`, show a blocking state and do not enter profile/staff pages yet unless backend adds explicit provider selection support
- request queue already supports optional `serviceProviderId` filter, so multi-provider users can still be supported there

## Org Management APIs

### Permissions

- Directory/detail routes require `service_providers.read`
- Mutations require `service_providers.write`
- Provider request assignment routes follow maintenance-request permissions, mainly `requests.assign`

### Endpoints

- `GET /org/service-providers`
- `GET /org/service-providers/:providerId`
- `POST /org/service-providers`
- `PATCH /org/service-providers/:providerId`
- `POST /org/service-providers/:providerId/buildings`
- `DELETE /org/service-providers/:providerId/buildings/:buildingId`
- `GET /org/service-providers/:providerId/access-grants`
- `POST /org/service-providers/:providerId/access-grants`
- `POST /org/service-providers/:providerId/access-grants/:grantId/resend-invite`
- `POST /org/service-providers/:providerId/access-grants/:grantId/disable`
- `POST /org/buildings/:buildingId/requests/:requestId/assign-provider`
- `POST /org/buildings/:buildingId/requests/:requestId/assign-provider-worker`
- `POST /org/buildings/:buildingId/requests/:requestId/unassign-provider`

### List Providers

`GET /org/service-providers?search=<text>`

Use this as:

- directory browser
- provider search source for maintenance assignment
- starting point for provider detail

Response shape:

```json
[
  {
    "id": "provider_uuid",
    "name": "RapidFix Technical Services",
    "serviceCategory": "Plumbing",
    "contactName": "Nadia Khan",
    "contactEmail": "ops@rapidfix.test",
    "contactPhone": "+971500000000",
    "notes": "24/7 emergency coverage",
    "isActive": true,
    "isLinkedToCurrentOrg": true,
    "providerProfileOwnedByProvider": true,
    "linkedBuildings": [
      {
        "buildingId": "building_uuid",
        "buildingName": "Central Tower",
        "createdAt": "2026-04-07T10:00:00.000Z"
      }
    ],
    "providerAdminAccessGrants": [
      {
        "id": "grant_uuid",
        "status": "ACTIVE",
        "inviteEmail": null,
        "invitedAt": null,
        "acceptedAt": "2026-04-07T12:00:00.000Z",
        "disabledAt": null,
        "user": {
          "id": "user_uuid",
          "email": "admin@rapidfix.test",
          "name": "Nadia Khan",
          "phone": null,
          "isActive": true,
          "mustChangePassword": false
        }
      }
    ],
    "createdAt": "2026-04-07T10:00:00.000Z",
    "updatedAt": "2026-04-07T12:00:00.000Z"
  }
]
```

### Get Provider Detail

`GET /org/service-providers/:providerId`

Use the same shape as the list item. No separate detail DTO exists.

### Create Provider

`POST /org/service-providers`

Request:

```json
{
  "name": "RapidFix Technical Services",
  "serviceCategory": "Plumbing",
  "contactName": "Nadia Khan",
  "contactEmail": "ops@rapidfix.test",
  "contactPhone": "+971500000000",
  "notes": "24/7 emergency coverage",
  "isActive": true,
  "buildingIds": ["building_uuid"],
  "adminEmail": "admin@rapidfix.test"
}
```

Behavior:

- `name` is required
- `buildingIds` is optional and can seed initial links for the current org
- `adminEmail` is optional and can immediately create the initial provider-admin invite
- if `adminEmail` is supplied, the returned provider payload includes updated access-grant state

### Update Provider

`PATCH /org/service-providers/:providerId`

Request:

```json
{
  "name": "RapidFix Technical Services",
  "serviceCategory": "Plumbing",
  "contactName": "Nadia Khan",
  "contactEmail": "ops@rapidfix.test",
  "contactPhone": "+971500000000",
  "notes": "Updated notes",
  "isActive": true
}
```

Behavior:

- all fields are optional
- backend trims string values
- if at least one active provider-admin access grant exists, this returns `409`
- frontend should disable edit actions when `providerProfileOwnedByProvider === true`

### Link Provider To Building

`POST /org/service-providers/:providerId/buildings`

Request:

```json
{
  "buildingId": "building_uuid"
}
```

Returns the full provider shape again.

### Request Provider Estimate On A Maintenance Request

`POST /org/buildings/:buildingId/requests/:requestId/request-estimate`

Request:

```json
{
  "serviceProviderId": "provider_uuid"
}
```

Behavior:

- use this for the management `Get Estimate` action
- provider must already be linked to the building
- backend links the request to the provider and moves the management queue to `AWAITING_ESTIMATE`
- response `estimate` now also includes `dueAt` and `reminderSentAt` so the UI can show quote SLA state
- this is different from normal provider execution assignment
- provider can now see the request in the provider portal and submit an estimate

### Unlink Provider From Building

`DELETE /org/service-providers/:providerId/buildings/:buildingId`

Returns the full provider shape again.

### List Provider Access Grants

`GET /org/service-providers/:providerId/access-grants`

Response:

```json
[
  {
    "id": "grant_uuid",
    "status": "PENDING",
    "inviteEmail": "admin@rapidfix.test",
    "invitedAt": "2026-04-07T10:00:00.000Z",
    "acceptedAt": null,
    "disabledAt": null,
    "user": {
      "id": "user_uuid",
      "email": "admin@rapidfix.test",
      "name": "Nadia Khan",
      "phone": null,
      "isActive": true,
      "mustChangePassword": true
    }
  }
]
```

### Create Provider Admin Invite

`POST /org/service-providers/:providerId/access-grants`

Request:

```json
{
  "email": "admin@rapidfix.test"
}
```

Behavior:

- this is the normal org-side action for initial provider admin onboarding
- if the email does not exist, backend creates a standalone user and returns a `PENDING` grant
- if the email already exists on an org-scoped user, backend rejects it
- backend also creates an `ADMIN` provider membership for that user
- frontend should treat `PENDING` as "invite sent / waiting for password setup"

### Resend Provider Admin Invite

`POST /org/service-providers/:providerId/access-grants/:grantId/resend-invite`

No body.

Behavior:

- only valid for `PENDING` grants
- returns the updated grant object

### Disable Provider Access Grant

`POST /org/service-providers/:providerId/access-grants/:grantId/disable`

Request:

```json
{
  "verificationMethod": "MANUAL_REVIEW"
}
```

Behavior:

- disables the access grant immediately
- disabled access should disappear from provider runtime behavior immediately

## Maintenance Assignment APIs For Org Management

These are still part of the org app, not the provider portal.

### Assign Provider

`POST /org/buildings/:buildingId/requests/:requestId/assign-provider`

Request:

```json
{
  "serviceProviderId": "provider_uuid"
}
```

Behavior:

- provider must be active
- provider must be linked to that building
- internal staff assignment is cleared
- provider worker assignment is cleared
- request stays in provider scope

### Assign Provider Worker

`POST /org/buildings/:buildingId/requests/:requestId/assign-provider-worker`

Request:

```json
{
  "userId": "worker_uuid"
}
```

Behavior:

- request must already be assigned to a provider
- worker must be an active membership of that same provider

### Unassign Provider

`POST /org/buildings/:buildingId/requests/:requestId/unassign-provider`

No body.

Behavior:

- clears provider and provider-worker assignment
- returns updated maintenance request

## Provider Portal APIs

### Auth + Scope

- All `/provider/*` and `/provider/requests/*` routes currently require JWT auth only.
- Access is resolved from provider memberships and grants, not org guards.
- A membership is accessible only if:
  - membership is active
  - linked provider is active
  - user is active
  - if there are grants for that user/provider, at least one must be `ACTIVE`

### Resolve Runtime Context

`GET /provider/me`

Response:

```json
{
  "userId": "user_uuid",
  "email": "admin@rapidfix.test",
  "providers": [
    {
      "providerId": "provider_uuid",
      "name": "RapidFix Technical Services",
      "serviceCategory": "Plumbing",
      "role": "ADMIN",
      "membershipIsActive": true
    }
  ]
}
```

Use this endpoint to:

- decide whether the user has provider access
- decide whether the user is `ADMIN` or `WORKER`
- decide whether the app can safely open single-provider screens

### Get Provider Profile

`GET /provider/profile`

Response:

```json
{
  "id": "provider_uuid",
  "name": "RapidFix Technical Services",
  "serviceCategory": "Plumbing",
  "contactName": "Nadia Khan",
  "contactEmail": "ops@rapidfix.test",
  "contactPhone": "+971500000000",
  "notes": "24/7 emergency coverage",
  "isActive": true,
  "createdAt": "2026-04-07T10:00:00.000Z",
  "updatedAt": "2026-04-07T12:00:00.000Z"
}
```

### Update Provider Profile

`PATCH /provider/profile`

Request:

```json
{
  "name": "RapidFix Technical Services",
  "serviceCategory": "Electrical",
  "contactName": "Nadia Khan",
  "contactEmail": "ops@rapidfix.test",
  "contactPhone": "+971500000000",
  "notes": "24/7 emergency coverage",
  "isActive": true
}
```

Behavior:

- only provider `ADMIN` can update
- returns the same profile shape as `GET /provider/profile`

### List Provider Staff

`GET /provider/staff`

Response:

```json
[
  {
    "userId": "user_uuid",
    "email": "worker@rapidfix.test",
    "name": "Provider Worker",
    "phone": "+971500000111",
    "role": "WORKER",
    "membershipIsActive": true,
    "userIsActive": true,
    "mustChangePassword": true,
    "createdAt": "2026-04-07T10:00:00.000Z",
    "updatedAt": "2026-04-07T10:00:00.000Z"
  }
]
```

### Create Provider Staff

`POST /provider/staff`

Request:

```json
{
  "email": "worker@rapidfix.test",
  "name": "Provider Worker",
  "phone": "+971500000111",
  "role": "WORKER",
  "isActive": true
}
```

Response:

```json
{
  "userId": "user_uuid",
  "email": "worker@rapidfix.test",
  "name": "Provider Worker",
  "phone": "+971500000111",
  "role": "WORKER",
  "membershipIsActive": true,
  "userIsActive": true,
  "mustChangePassword": true,
  "createdAt": "2026-04-07T10:00:00.000Z",
  "updatedAt": "2026-04-07T10:00:00.000Z",
  "tempPassword": "generated_temp_password"
}
```

Behavior:

- only provider `ADMIN` can create staff
- email must be unique across users
- backend creates a standalone user and an active provider membership
- `tempPassword` is only returned on creation, so frontend should show/copy it immediately

### Update Provider Staff

`PATCH /provider/staff/:userId`

Request:

```json
{
  "role": "ADMIN",
  "isActive": true
}
```

Behavior:

- only provider `ADMIN` can update staff
- provider admin cannot modify their own membership
- use this for role changes and activation/deactivation

## Provider Request APIs

### Endpoints

- `GET /provider/requests`
- `GET /provider/requests/comments/unread-count`
- `GET /provider/requests/:requestId`
- `POST /provider/requests/:requestId/assign-worker`
- `POST /provider/requests/:requestId/status`
- `GET /provider/requests/:requestId/comments`
- `POST /provider/requests/:requestId/comments`
- `POST /provider/requests/:requestId/attachments`

### List Provider Requests

`GET /provider/requests?status=OPEN&serviceProviderId=<uuid>`

Query:

- `status`: optional maintenance status enum
- `serviceProviderId`: optional provider filter, useful if `/provider/me` returns multiple providers

Response item shape:

```json
[
  {
    "id": "request_uuid",
    "buildingId": "building_uuid",
    "buildingName": "Central Tower",
    "unit": {
      "id": "unit_uuid",
      "label": "A-1204",
      "floor": 12
    },
    "createdBy": {
      "id": "user_uuid",
      "name": "Resident A",
      "email": "resident@example.com"
    },
    "serviceProvider": {
      "id": "provider_uuid",
      "name": "RapidFix Technical Services",
      "serviceCategory": "Plumbing"
    },
    "serviceProviderAssignedTo": {
      "id": "worker_uuid",
      "name": "Worker Name",
      "email": "worker@example.com"
    },
    "title": "Leaky faucet",
    "description": "Kitchen sink dripping",
    "status": "ASSIGNED",
    "priority": "HIGH",
    "type": "PLUMBING",
    "attachments": [],
    "ownerApproval": {
      "status": "APPROVED",
      "requestedAt": null,
      "requestedByUserId": null,
      "deadlineAt": null,
      "decidedAt": null,
      "decidedByOwnerUserId": null,
      "reason": null,
      "requiredReason": null,
      "estimatedAmount": null,
      "estimatedCurrency": null,
      "decisionSource": null,
      "overrideReason": null,
      "overriddenByUserId": null
    },
    "estimate": {
      "status": "NOT_REQUESTED",
      "requestedAt": null,
      "requestedByUserId": null,
      "submittedAt": null,
      "submittedByUserId": null
    },
    "createdAt": "2026-04-07T10:00:00.000Z",
    "updatedAt": "2026-04-07T10:00:00.000Z"
  }
]
```

Frontend guidance:

- always show `buildingName`
- show `unit.label` when present
- show assigned provider worker if `serviceProviderAssignedTo` exists
- read the `estimate` block to distinguish:
  - estimate not requested yet
  - estimate requested and pending
  - estimate submitted
- if owner approval is pending or rejected, keep the request visible but respect blocked actions

### Get Provider Request

`GET /provider/requests/:requestId`

Uses the same response shape as list items.

### Assign Worker From Provider Portal

`POST /provider/requests/:requestId/assign-worker`

Request:

```json
{
  "userId": "worker_uuid"
}
```

Behavior:

- only provider `ADMIN` can do this
- request must already be assigned to that provider
- worker must be an active membership of that provider

### Update Provider Request Status

`POST /provider/requests/:requestId/status`

Request:

```json
{
  "status": "IN_PROGRESS"
}
```

Behavior:

- provider admins can update any request for their provider
- provider workers can update only requests assigned to them
- backend enforces maintenance status transition rules

### Submit Provider Estimate

`POST /provider/requests/:requestId/estimate`

Request:

```json
{
  "estimatedAmount": 1750,
  "estimatedCurrency": "AED",
  "approvalRequiredReason": "Water heater replacement exceeds threshold"
}
```

Optional policy fields can also be sent when provider findings clarify scope:

- `isEmergency`
- `isLikeForLike`
- `isUpgrade`
- `isMajorReplacement`
- `isResponsibilityDisputed`
- `ownerApprovalDeadlineAt`

Behavior:

- provider admins can submit an estimate across provider requests
- provider workers can submit an estimate only on requests assigned to them
- backend re-runs maintenance policy immediately
- returned payload includes `estimate.status = SUBMITTED` plus `submittedAt` / `submittedByUserId`
- if the estimate stays within direct-dispatch rules, owner approval remains or returns to `NOT_REQUIRED`
- if the estimate requires owner approval, backend automatically moves the request to pending owner approval
- returned payload uses the standard provider request shape, so frontend should read the updated `ownerApproval` block after estimate submission

### List Provider Comments

`GET /provider/requests/:requestId/comments`

Behavior:

- only shared/visible comments are returned to providers

### Add Provider Comment

`POST /provider/requests/:requestId/comments`

Request:

```json
{
  "message": "Technician scheduled for tomorrow morning."
}
```

Behavior:

- provider admins can comment across provider requests
- provider workers can comment only on requests assigned to them

### Add Provider Attachments

`POST /provider/requests/:requestId/attachments`

Request shape follows the same maintenance attachment contract already used elsewhere:

```json
{
  "attachments": [
    {
      "fileName": "estimate.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 12345,
      "url": "https://storage.example.com/file.pdf"
    }
  ]
}
```

Behavior:

- provider admins can attach files across provider requests
- provider workers can attach only on requests assigned to them
- response is the updated provider request payload

### Provider Comment Unread Count

`GET /provider/requests/comments/unread-count`

Response:

```json
{
  "unreadCount": 4
}
```

Use this for sidebar badges. Do not compute from partial pages.

## Explicitly Removed From The Contract

Do not build against these old endpoints:

- `POST /org/service-providers/:providerId/users`
- `DELETE /org/service-providers/:providerId/users/:userId`
- `GET /org/provider/requests`
- `GET /org/provider/requests/comments/unread-count`
- `GET /org/provider/requests/:requestId`
- `POST /org/provider/requests/:requestId/assign-worker`
- `POST /org/provider/requests/:requestId/status`
- `GET /org/provider/requests/:requestId/comments`
- `POST /org/provider/requests/:requestId/comments`
- `POST /org/provider/requests/:requestId/attachments`

## Recommended Screen Model

### Org App

- Provider Directory List
  - search box
  - provider status badge
  - linked building count
  - provider-owned badge when `providerProfileOwnedByProvider === true`
- Provider Detail
  - shared profile section
  - linked buildings section
  - provider admin access section
  - edit button disabled when provider-owned
- Maintenance Request Assignment Modal
  - select linked active provider
  - if provider already selected, optional worker dropdown from provider staff

### Provider App

- Provider Home
  - call `GET /provider/me`
  - decide single-provider vs unsupported-multi-provider state
- Provider Profile
  - editable for admin only
- Staff List
  - role badge
  - membership active toggle
  - create-staff modal with temp password reveal
- Request Queue
  - status filter
  - optional provider filter if user has multiple providers
  - unread comment badge from unread-count endpoint
- Request Detail
  - request metadata
  - owner approval block state
  - assigned worker area
  - comments
  - attachments
  - status update actions

## Error Expectations

- `401` for missing or invalid token
- `403` for missing org permissions or no accessible provider membership
- `404` when org-scoped resource or request is outside caller scope
- `409` when business rules block the action

Common `409` cases frontend should expect:

- org-side provider profile edit after provider ownership has started
- provider portal routes when user has multiple active provider memberships but no single-provider context exists
- provider admin trying to edit their own membership
- request action attempted in the wrong assignment state

## Frontend Guidance Summary

- Treat org-side provider management and provider portal as separate products.
- Use `/provider/me` as the runtime source of truth for provider access.
- Do not assume provider routes are org-scoped.
- Disable org-side profile editing once `providerProfileOwnedByProvider` is true.
- Do not build provider-worker management into the org app.
- Expect `tempPassword` only once on provider staff creation and surface it immediately.
- Prefer unread-count endpoints for badges instead of deriving counts from partial lists.
- Build a graceful blocking UI for multi-provider users until backend adds explicit provider selection support to all portal routes.
