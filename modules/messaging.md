# Messaging Review

## Scope

- Source: `src/modules/messaging`
- Main files:
  - `messaging.controller.ts`
  - `resident-messaging.controller.ts`
  - `owner-messaging.controller.ts`
  - `messaging.service.ts`
  - `messaging.repo.ts`
  - DTOs under `src/modules/messaging/dto`
- Public routes:
  - Org conversations: `/org/conversations/*`
  - Resident messaging: `/resident/messages/*`
  - Owner messaging: `/owner/messages/*` and `/owner/conversations/*`
- Core responsibility: private conversations between org users, residents, and owners, including message delivery and unread tracking.

## What This Module Really Owns

- Conversation creation rules and participant validation.
- Resident/owner scoped conversation entry points.
- Participant-only visibility for conversation lists and reads.
- Message send, read tracking, and realtime notifications.

## Important Architectural Notes

- Org messaging uses `messaging.read` and `messaging.write` permissions.
- Org messaging is scoped by:
  - org-wide authority for org-scoped `messaging.write`
  - building-scoped authority for building messaging handlers
- Resident and owner flows enforce active occupancy or owner unit access.
- Realtime is published via `NotificationsRealtimeService` on `conversation:*` and `message:new` events.
- Message and conversation notifications are stored via `NotificationsService`.

## Step-By-Step Request Flows

### 1. Org create conversation

1. `POST /org/conversations` requires `messaging.write`.
2. Validates participant IDs are active users in the org.
3. If no `buildingId` is provided and user lacks org-wide access, it fails.
4. For building-scoped users:
   - `buildingId` must be in org
   - sender must have messaging permission in that building
   - participants must be residents in that building (except sender)
5. Sender is always included as a participant.
6. Conversation is created with initial message.
7. Realtime `conversation:new` is emitted to other participants.
8. Notification of type `CONVERSATION_CREATED` is stored for other participants.

### 2. Org list and read conversations

1. `GET /org/conversations` requires `messaging.read`.
2. Uses cursor pagination based on `updatedAt|id`.
3. Only participant conversations are returned.
4. `GET /org/conversations/:id` requires participant membership.
5. `POST /org/conversations/:id/read` updates `lastReadAt` for the participant.
6. Realtime `conversation:read` is emitted to the reader.

### 3. Org send message

1. `POST /org/conversations/:id/messages` requires `messaging.write`.
2. Sender must be a participant.
3. Message is stored and conversation `updatedAt` is refreshed.
4. Sender’s `lastReadAt` is updated to message time.
5. Realtime `message:new` is emitted to other participants.
6. Notification of type `MESSAGE_CREATED` is stored for other participants.

### 4. Resident messaging (management)

1. `GET /resident/messages/management-contacts` lists eligible management contacts.
2. Requires active occupancy; contacts are derived from building-scoped messaging handlers.
3. `POST /resident/messages/management`:
   - uses active occupancy building
   - optionally targets a specific management user
   - fails if no eligible management user exists
4. Conversation is created and notifications are emitted as normal.

### 5. Resident messaging (owner)

1. `POST /resident/messages/owner`:
   - requires active occupancy
   - requires an active owner user for the unit
2. Conversation includes resident and owner user(s).
3. Fails with conflict if no active owner user exists.

### 6. Owner messaging (management)

1. `POST /owner/messages/management`:
   - requires unit in owner’s accessible scope
   - resolves management users with `messaging.write` in the building/org
2. Conversation is created with owner + management users.
3. Fails if no management users are assigned.

### 7. Owner messaging (tenant)

1. `POST /owner/messages/tenants`:
   - requires unit in owner’s accessible scope
   - tenant must be actively occupying that unit
2. Conversation is created between owner and tenant.
3. Fails if tenant is not active in that unit.

### 8. Owner conversation list and read

1. `GET /owner/conversations` returns all conversations where owner is a participant (cross-org).
2. Uses the same cursor pagination.
3. `GET /owner/conversations/:id` requires participation.
4. `POST /owner/conversations/:id/read` updates `lastReadAt` and emits `conversation:read`.

## Read Models And Response Shapes

### Conversation list response

- `ConversationResponseDto` includes:
  - subject, participants, unread count, last message, timestamps
- Unread count is derived by comparing `lastReadAt` to message timestamps.

### Conversation detail response

- Includes the full message list.

### Owner conversation response

- Extends conversation response with:
  - `orgId`, `orgName`
  - `buildingName`

### Message response

- Includes sender summary and content.

## Validation And Defaults

- Subjects are optional, max length 200.
- Message content is required, max length 5000.
- Cursor is encoded as `updatedAt|id` and base64 encoded.
- Resident and owner routes require current scope; historical scope alone is not sufficient.

## Data And State Model

### Core tables touched directly

- `Conversation`
- `ConversationParticipant`
- `Message`
- `Occupancy`
- `UnitOwnership`
- `OwnerAccessGrant`

### External/domain side effects

- Realtime events via `NotificationsRealtimeService`.
- Persistent notifications via `NotificationsService`.

## Edge Cases And Important Scenarios

- Org-scoped `messaging.write` acts as org-wide authority.
- Building-scoped handlers must include a buildingId and can only target residents in that building.
- Residents without active occupancy are blocked from messaging.
- Owners without accessible unit scope are blocked.
- Owner-to-tenant fails if tenant is not active in that unit.
- Owner conversations are cross-org but participant-only.
- Prior resident conversation history is restored once the same user is active again.

## Strengths

- Participant-only visibility prevents broad directory leakage.
- Clear separation between org, resident, and owner entry points.
- Realtime and notification integration provides immediate UX feedback.

## Risks And Design Weaknesses

### 1. Policy logic is concentrated in the service

- Participant resolution and authority checks are complex and centralized.

### 2. Cursor pagination is opaque to clients

- Requires correct encoding/decoding; invalid cursor returns 400.

### 3. Mixed authority models

- Org-wide vs building-scoped messaging is subtle and can confuse clients.

## Improvement Opportunities

### High priority

- Add a dedicated participant-resolution helper to shrink service complexity.
- Document the org-wide vs building-scoped authority rules explicitly.

### Medium priority

- Add pagination and search for messages within a conversation.
- Add support for attachments and message edits.

### Lower priority

- Add message retention policies and conversation archiving.
- Add analytics around response times and unread durations.

## Concrete Review Questions For Your Lead

1. Should building-scoped messaging be allowed to message non-residents in that building?
2. Do we want a dedicated owner/resident conversation discovery endpoint?
3. Is the current org-wide messaging authority too permissive?
4. Do we need message retention or export policies?

## Testing Signals

### Integration coverage already present

- `test/messaging.e2e.spec.ts`

### Unit coverage already present

- `messaging.service.spec.ts`

### Notable cases already tested

- org-scoped vs building-scoped permissions
- resident-to-management and resident-to-owner flows
- owner-to-management and owner-to-tenant flows
- participant-only visibility and read counts
- restoring former resident conversation visibility
