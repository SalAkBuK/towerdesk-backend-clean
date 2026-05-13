# Broadcasts Review

## Scope

- Source: `src/modules/broadcasts`
- Main files:
  - `broadcasts.controller.ts`
  - `broadcasts.service.ts`
  - `broadcasts.repo.ts`
  - `broadcasts.constants.ts`
  - DTOs under `src/modules/broadcasts/dto`
- Public routes:
  - `POST /org/broadcasts`
  - `GET /org/broadcasts`
  - `GET /org/broadcasts/:id`
- Core responsibility: create org or building-targeted announcements and fan them out into notifications.

## What This Module Really Owns

- Broadcast creation rules and audience targeting.
- Broadcast storage and list/detail APIs.
- Notification fan-out for broadcast recipients.
- Metadata shaping for reporting and legacy compatibility.

## Important Architectural Notes

- Org routes require `broadcasts.read` or `broadcasts.write`.
- Org-scoped `broadcasts.write` acts as org-wide broadcast authority.
- Building-scoped broadcast authority is limited to buildings where the user has `broadcasts.write`.
- Notifications are created via `NotificationsService` with type `BROADCAST`.

## Step-By-Step Request Flows

### 1. Create broadcast

1. `POST /org/broadcasts` requires `broadcasts.write`.
2. Audiences are normalized:
   - default to `TENANTS` when omitted
3. Target building selection:
   - if `buildingIds` provided, validate each is in org
   - org-scoped users can target any building
   - building-scoped users can only target assigned buildings
   - if no `buildingIds`, defaults to all accessible buildings
4. Broadcast metadata is built:
   - audiences
   - scope (`org_wide`, `multi_building`, `single_building`)
   - building count
   - audience summary
5. Recipient IDs are resolved by audience rules.
6. Broadcast row is created.
7. Notifications are created for each recipient with `NotificationTypeEnum.BROADCAST`.

### 2. List broadcasts

1. `GET /org/broadcasts` requires `broadcasts.read`.
2. Optional building filter via `buildingId`.
3. If user is building-scoped, list is limited to readable buildings.
4. Cursor pagination uses `createdAt|id`.
5. Returns `items` and optional `nextCursor`.

### 3. Get broadcast detail

1. `GET /org/broadcasts/:id` requires `broadcasts.read`.
2. Broadcast must be in org and readable building scope.
3. Returns broadcast detail with metadata.

## Audience Resolution Rules

- `TENANTS`: active residents in target buildings.
- `MANAGERS`, `STAFF`, `BUILDING_ADMINS`: building assignments by role type.
- `ADMINS`: org admins, optionally filtered to building-linked users.
- `ALL_USERS`: all active org users (if no building filter) or building-linked users.

## Read Models And Response Shapes

### Broadcast response

- Includes:
  - sender identity
  - building IDs
  - recipient count
  - metadata (audiences, scope, building count, summary)

### Metadata fallback

- Legacy broadcasts without metadata receive inferred defaults:
  - scope based on building count
  - audiences empty
  - audience summary defaults to "Recipients"

## Validation And Defaults

- Title is required (3–200 chars).
- Body is optional (max 2000 chars).
- Audience list must be non-empty if provided.
- `buildingIds` must be valid UUIDs in the org.

## Data And State Model

### Core tables touched directly

- `Broadcast`
- `UserAccessAssignment`
- `Occupancy`
- `User`

### External/domain side effects

- Creates notification rows for each recipient.
- Realtime delivery is handled downstream by notifications.

## Edge Cases And Important Scenarios

- Org-scoped users can broadcast org-wide without specifying buildings.
- Building-scoped users default to their assigned buildings; empty scope is rejected.
- Building filter for listing is enforced based on `broadcasts.read`.
- Legacy broadcasts without metadata still return stable metadata.

## Strengths

- Clear separation between broadcast record and notification fan-out.
- Strong audience metadata for reporting.
- Permission-aware building scoping for both write and read paths.

## Risks And Design Weaknesses

### 1. Recipient resolution can be heavy

- Large building sets can generate large recipient lists and notification volume.

### 2. Fan-out is synchronous

- Broadcast creation latency depends on notification creation cost.

### 3. Admin audience filtering is subtle

- Admins are filtered to building-linked users when building IDs are provided.

## Improvement Opportunities

### High priority

- Add async fan-out to reduce create latency and improve reliability.
- Add explicit recipient preview counts before create.

### Medium priority

- Add scheduling and cancellation support.
- Add per-broadcast analytics (delivery counts, reads).

### Lower priority

- Allow attachments or rich formatting.
- Add rate limits per org to avoid accidental spam.

## Concrete Review Questions For Your Lead

1. Should broadcasts be queued instead of synchronous fan-out?
2. Do we need a recipient preview endpoint?
3. Are admin recipients correctly filtered when buildingIds are provided?
4. Should org-wide broadcasts require explicit confirmation?

## Testing Signals

### Unit coverage already present

- `broadcasts.service.spec.ts`

### Notable cases already tested

- org-wide vs building-scoped broadcast authority
- readable building enforcement for listings
- legacy metadata fallback handling
