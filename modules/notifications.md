# Notifications Review

## Scope

- Source: `src/modules/notifications`
- Main files:
  - `notifications.controller.ts`
  - `owner-notifications.controller.ts`
  - `dev-notifications.controller.ts`
  - `notifications.service.ts`
  - `notifications.repo.ts`
  - `notifications.listener.ts`
  - `notification-recipient.resolver.ts`
  - `notifications.gateway.ts`
  - `notifications-realtime.service.ts`
  - `push-notifications.service.ts`
  - `push-devices.repo.ts`
  - DTOs under `src/modules/notifications/dto`
- Public routes:
  - Org users: `/notifications/*`
  - Owner users: `/owner/notifications/*`
  - Dev-only: `/dev/notifications/create`
- Realtime: Socket.IO namespace `/notifications`
- Core responsibility: store notifications, resolve recipients, deliver realtime updates, and manage push devices.

## What This Module Really Owns

- Notification creation and persistence.
- Recipient resolution for operational events.
- Realtime delivery (`notifications:*` events).
- Push device registration and push delivery.
- Owner cross-org visibility rules for notifications.

## Important Architectural Notes

- Org notifications are org-scoped and permission-gated (`notifications.read`, `notifications.write`).
- Owner notifications are cross-org and scope is derived from owner access grants.
- Cursor pagination uses `createdAt|id` encoded into base64.
- Dev notification route is gated by `NODE_ENV !== production`.
- Push delivery is synchronous and can be disabled via `PUSH_PROVIDER=noop`.
- Owner push targets are filtered by active owner grants at send time.

## Step-By-Step Request Flows

### 1. List notifications (org users)

1. `GET /notifications` requires `notifications.read`.
2. Supports filters:
   - `unreadOnly`
   - `includeDismissed`
   - `type`
   - `cursor`
   - `limit` (1–100, default 20)
3. Notifications are paginated by `createdAt desc`, `id desc`.
4. Response includes `nextCursor` when more results exist.

### 2. List notifications (owner users)

1. `GET /owner/notifications` uses owner scope from `OwnerPortfolioScopeService`.
2. Notifications are pulled across all accessible org IDs.
3. Same pagination and filters as org list.

### 3. Read and dismiss flows

1. `POST /notifications/:id/read` marks one notification read.
2. `POST /notifications/read-all` marks all as read.
3. `POST /notifications/:id/dismiss` hides a notification from default lists.
4. `POST /notifications/:id/undismiss` restores visibility.
5. Owner equivalents operate across org scope and resolve org before action.
6. Realtime events are emitted for read, read_all, dismiss, undismiss.

### 4. Push device registration (org users)

1. `POST /notifications/push-devices/register` registers or reactivates a device.
2. Provider/format checks are enforced (Expo tokens validated).
3. `POST /notifications/push-devices/unregister` disables a device by token.

### 5. Push device registration (owner users)

1. `POST /owner/notifications/devices` registers a device with `orgId = null`.
2. `PATCH /owner/notifications/devices/:deviceId` updates device metadata.
3. `DELETE /owner/notifications/devices/:deviceId` disables the device.

### 6. Realtime socket auth

1. Client connects to `/notifications` namespace.
2. Token sources:
   - `Authorization: Bearer <token>`
   - `auth.token`
   - `?token=`
3. Optional org override in `auth.orgId` or `?orgId=`.
4. Owners without orgId join all accessible org rooms.
5. On connect, emits `notifications:hello` with unread count.

### 7. Notification creation from events

1. `NotificationsListener` listens to maintenance request events.
2. `NotificationRecipientResolver` determines recipient user IDs.
3. Notifications are created and published in realtime.
4. Push notifications are sent to registered devices for that audience.

## Recipient Resolution Rules (Maintenance Requests)

- Request created:
  - building managers/admins (fallback org admins if none)
- Request assigned:
  - assigned staff or provider managers
  - resident creator
  - ops recipients
  - owners if emergency
  - previous assignees receive updates on reassignment
- Request status changed:
  - resident creator
  - assigned staff
  - ops recipients
  - previous execution recipients on reassignment
- Request commented:
  - resident creator
  - assigned staff
  - ops recipients
  - active owners
- Owner approval requested/reminder:
  - active owners for the unit
- Owner request approved/rejected/overridden:
  - execution recipients
  - owners added for override

## Read Models And Response Shapes

### Notification response

- `NotificationResponseDto` includes:
  - `id`, `orgId`, `type`, `title`, `body`, `data`
  - `readAt`, `dismissedAt`, `createdAt`

### Notification list response

- `NotificationsListResponseDto` returns `items` and `nextCursor`.

### Push device response

- Includes provider, platform, token, app/device IDs, active status, and timestamps.

## Validation And Defaults

- Cursor must decode to `createdAt|id` or 400 is returned.
- Notification type filter is validated against `NotificationTypeEnum`.
- Push token validation is provider-aware (Expo token format enforced).
- Read and dismiss operations ignore already-read/dismissed rows.

## Data And State Model

### Core tables touched directly

- `Notification`
- `PushDevice`

### External/domain side effects

- Socket.IO realtime events for new/read/dismiss flows.
- Push delivery via Expo when enabled.
- Recipient resolution queries org/building roles, provider admins, and owner access grants.

## Edge Cases And Important Scenarios

- Owner notifications span multiple orgs but must honor active grants.
- Same-party cross-org owners do not receive notifications without an explicit grant.
- Owner scope changes should immediately stop push targeting.
- `markReadAcrossOrgs` and `dismissAcrossOrgs` resolve the correct org before action.
- Dev controller is blocked in production.
- Cursor stability is based on `createdAt` + `id`, not `offset`.

## Strengths

- Consistent cursor pagination and validation.
- Explicit recipient resolution logic with test coverage.
- Realtime and push delivery are cleanly separated from persistence.

## Risks And Design Weaknesses

### 1. Recipient resolution is complex and central

- A lot of business logic sits in the resolver without explicit spec docs.

### 2. Push delivery is synchronous

- Notification creation can be slowed by push delivery latency.

### 3. Owner scope list is recomputed per request

- Multiple calls resolve the same owner org scope for list/read actions.

## Improvement Opportunities

### High priority

- Publish a recipient matrix for maintenance-request events.
- Add async queueing for push delivery and retries.

### Medium priority

- Add caching for owner org scope with explicit invalidation.
- Add notification preferences and per-type opt-out controls.

### Lower priority

- Expand event ingestion beyond maintenance requests with a typed registry.
- Add delivery observability (counts, failures, latency).

## Concrete Review Questions For Your Lead

1. Do we want to move push delivery off the request path?
2. Should owner scope resolution be cached or is real-time accuracy more important?
3. Are the recipient rules for reassignment and emergency adequate?
4. Should dev-notification routes be compiled out of prod builds?

## Testing Signals

### Integration coverage already present

- `test/notifications.e2e.spec.ts`
- `test/notifications-realtime.e2e.spec.ts`
- `test/owner-notifications-push.e2e.spec.ts`

### Unit coverage already present

- `notifications.service.spec.ts`
- `notifications.listener.spec.ts`
- `notification-recipient.resolver.spec.ts`

### Notable cases already tested

- owner cross-org pagination and read actions
- recipient resolution for provider assignments and owner approvals
- realtime delivery and owner room joins
- owner push device registration and access-grant gating
