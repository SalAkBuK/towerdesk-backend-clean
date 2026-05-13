# Mobile Handoff: Service Provider Worker Portal

Use this file as the source of truth for the service provider worker mobile app.

## Goal

Allow a provider worker to:

- sign in to the provider portal
- resolve their active provider context
- view the provider request queue
- open provider request detail
- submit an estimate when assigned
- add shared comments
- add attachments
- move an assigned request to `IN_PROGRESS` or `COMPLETED`

This is not a separate backend product. The worker app uses the existing
provider portal APIs under `/provider/*`.

## Backend Reality

There is no separate worker-only request API family.

Provider workers and provider admins both use `/provider/*`, but the backend
enforces different permissions:

- provider admins can act across requests for their provider
- provider workers can read provider requests for their provider
- provider workers can mutate only requests assigned to them
- provider workers cannot assign workers to requests

## Locked Frontend Rules

- Treat the worker app as a provider portal client, not as a building/org app.
- Build `GET /provider/me` first and block the app until provider runtime
  context is resolved.
- If the user has zero active provider memberships, show a blocking
  "no provider access" state.
- If the user has multiple active provider memberships, treat that as blocked
  unless the screen is using the request list filter that supports
  `serviceProviderId`.
- Do not expose worker assignment UI in the worker app.
- Do not let workers update requests that are not assigned to them.
- Do not show building `INTERNAL` comments in the worker app.
- Do not offer cancel-request actions in the worker app.
- Do not assume attachments upload raw files directly to
  `/provider/requests/:requestId/attachments`; that endpoint accepts attachment
  metadata only.

## Endpoints

### Runtime Context

- `GET /provider/me`

### Request Queue / Detail

- `GET /provider/requests`
- `GET /provider/requests/:requestId`

### Assigned Worker Actions

- `POST /provider/requests/:requestId/status`
- `POST /provider/requests/:requestId/estimate`
- `GET /provider/requests/:requestId/comments`
- `POST /provider/requests/:requestId/comments`
- `POST /provider/requests/:requestId/attachments`
- `GET /provider/requests/comments/unread-count`

### Do Not Use In Worker UI

- `POST /provider/requests/:requestId/assign-worker`
- `GET /provider/staff`
- `POST /provider/staff`
- `PATCH /provider/staff/:userId`

Those routes exist for provider-admin flows, not worker-mobile task handling.

## Resolve Runtime Context

`GET /provider/me`

Use this first after login.

Behavior:

- Returns the caller's accessible provider memberships and runtime profile data.
- Required before entering provider portal flows.
- Current backend has an important constraint:
  - `providers.length === 0`: show no access state
  - `providers.length === 1`: proceed normally
  - `providers.length > 1`: most provider detail/write routes can become
    ambiguous, so block entry unless the flow is explicitly using the request
    list filter that supports `serviceProviderId`

Practical rule:

- The worker mobile app should assume one active provider context.

## Request Queue

`GET /provider/requests?status=OPEN&serviceProviderId=<uuid>`

Query params:

- `status`: optional, `OPEN | ASSIGNED | IN_PROGRESS | COMPLETED | CANCELED`
- `serviceProviderId`: optional, useful only when the backend/runtime context
  contains multiple accessible providers

Behavior:

- Returns requests assigned to one of the caller's active provider memberships.
- Workers can see provider requests for their provider.
- Mutation permissions are still narrower than read permissions.

Recommended worker tabs:

- `Open`
- `Assigned`
- `In Progress`
- `Completed`

Recommended list emphasis:

- status
- building name
- unit label
- category / title
- priority
- created time
- assigned provider worker
- owner approval state if present

## Request Detail

`GET /provider/requests/:requestId`

Behavior:

- Returns one provider-facing maintenance request.
- Returns `404` if the request is not visible through one of the caller's
  active provider memberships.
- The response can include:
  - building and unit context
  - request status
  - attachments
  - service provider info
  - assigned provider worker info
  - owner approval block
  - estimate block

Worker UI should derive action availability from:

- whether the logged-in worker is the assigned provider worker
- whether the request is closed
- whether execution is blocked by owner approval

## Worker Action Rules

### Status Updates

`POST /provider/requests/:requestId/status`

```json
{
  "status": "IN_PROGRESS"
}
```

Allowed worker statuses:

- `IN_PROGRESS`
- `COMPLETED`

Behavior:

- Workers can update only when they are the assigned provider worker.
- Backend enforces maintenance status transition rules.
- Backend blocks execution while owner approval is still execution-blocking.

UI rule:

- Hide or disable status actions if the worker is not the assigned technician.

## Submit Estimate

`POST /provider/requests/:requestId/estimate`

Example:

```json
{
  "estimatedAmount": 350,
  "estimatedCurrency": "AED",
  "approvalRequiredReason": "Pump replacement required",
  "isEmergency": false,
  "isLikeForLike": true,
  "isUpgrade": false
}
```

Behavior:

- Workers can submit an estimate only when they are the assigned provider
  worker.
- Backend immediately re-runs maintenance approval policy.
- The updated response may:
  - remain `NOT_REQUIRED` for owner approval
  - move into an owner-approval-required state
- The request can become execution-blocked after estimate submission depending
  on policy outcome.

UI rule:

- After estimate submission, refresh the whole request detail and trust the
  returned `ownerApproval` block.

## Shared Comments

`GET /provider/requests/:requestId/comments`

`POST /provider/requests/:requestId/comments`

```json
{
  "message": "Technician scheduled for tomorrow morning."
}
```

Behavior:

- Provider comments are always stored as `SHARED`.
- Workers can comment only when they are the assigned provider worker.
- Comment reads return only provider-visible shared comments.
- Building-side `INTERNAL` comments are hidden from provider users.
- Reading comments marks visible provider comments as read for the caller.

## Comment Unread Badge

`GET /provider/requests/comments/unread-count`

Response:

```json
{
  "unreadCount": 4
}
```

Use this for worker inbox badges instead of summing comment counts locally.

## Attachments

`POST /provider/requests/:requestId/attachments`

```json
{
  "attachments": [
    {
      "fileName": "leak-photo-1.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": 182034,
      "url": "https://storage.example.com/provider/leak-photo-1.jpg"
    }
  ]
}
```

Behavior:

- Workers can add attachments only when they are the assigned provider worker.
- Blocked for `COMPLETED` and `CANCELED` requests.
- Response is the updated provider request payload.

Important:

- This endpoint accepts attachment metadata and file URL, not raw multipart file
  upload.
- If the mobile app needs direct binary upload, that must happen through the
  storage flow available elsewhere in the product before calling this endpoint.

## Recommended Screen Model

### Worker App

- Sign-in
- Provider access gate
  - no access
  - single provider access
  - ambiguous multi-provider access
- Request queue
  - status tabs
  - unread shared comment badge
- Request detail
  - request summary
  - owner approval banner
  - attachments gallery
  - shared comment thread
  - estimate form
  - status action bar

## Action Availability Matrix

- View queue: allowed for accessible provider requests
- View request detail: allowed for accessible provider requests
- Add comment: only when assigned worker
- Add attachment: only when assigned worker and request not closed
- Submit estimate: only when assigned worker
- Mark `IN_PROGRESS`: only when assigned worker and execution not blocked
- Mark `COMPLETED`: only when assigned worker and execution not blocked
- Assign worker: never in worker app

## Error Expectations

- `401` for missing or invalid token
- `403` for no provider access or forbidden provider action
- `404` when the request is not visible to the caller's active provider
  memberships
- `409` when the request state blocks the attempted action

Examples of likely `409` cases:

- request is closed
- invalid maintenance status transition
- execution is blocked pending owner approval
- provider route is ambiguous under multi-provider runtime context

## Practical Decision

For the service provider worker mobile app:

- use `/provider/me` as the runtime source of truth
- use `/provider/requests` for the worker queue
- use `/provider/requests/:requestId` for detail
- expose comments, attachments, estimate, and status actions only for the
  assigned worker
- do not build admin/staff-management flows into the worker app
