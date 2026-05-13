# Mobile Handoff: Tenant Messaging

Use this file as the source of truth for tenant/resident messaging in the mobile app.

## Goal

Allow tenants to:

- message building management
- optionally choose a specific management contact from the backend-provided allowed list
- message the current owner of their active unit
- view their existing conversations
- reply, read, and badge unread counts

The tenant app should not ask the user to enter participant user IDs to start these conversations.

## Backend Reality

There are two different ways conversations can be created:

1. Generic org conversation creation:
   - `POST /org/conversations`
   - requires explicit `participantUserIds`
   - intended for org/building-side operational UIs

2. Resident convenience creation:
   - `GET /resident/messages/management-contacts`
   - `POST /resident/messages/management`
   - `POST /resident/messages/owner`
   - backend resolves the allowed participants automatically from the logged-in resident's active occupancy

For the tenant mobile app, use the resident convenience endpoints for conversation creation.

## Locked Frontend Rules

- Do not use `POST /org/conversations` to start a new tenant chat.
- Do not ask the tenant for `participantUserIds`.
- Do not let the tenant choose arbitrary owners or staff members.
- If offering management contact selection, load only `GET /resident/messages/management-contacts` and let the tenant choose only from that backend-provided list.
- To start management chat, call `POST /resident/messages/management`.
- To start owner chat, call `POST /resident/messages/owner`.
- After a conversation exists, use the shared `/org/conversations/*` endpoints for inbox, thread detail, replies, unread count, and read state.
- If the resident has no active occupancy, hide new chat actions or handle `409 Conflict` cleanly.

## Endpoints

### Start Conversation

- `GET /resident/messages/management-contacts`
- `POST /resident/messages/management`
- `POST /resident/messages/owner`

### Inbox / Thread

- `GET /org/conversations`
- `GET /org/conversations/unread-count`
- `GET /org/conversations/:id`
- `POST /org/conversations/:id/messages`
- `POST /org/conversations/:id/read`

## List Allowed Management Contacts

`GET /resident/messages/management-contacts`

Behavior:

- Backend uses the resident's active occupancy to resolve the building automatically.
- Returns only management contacts the resident is allowed to message for that building.
- Returns `409` if the resident has no active occupancy.

## Create Resident -> Management Conversation

`POST /resident/messages/management`

```json
{
  "managementUserId": "Optional specific management user UUID",
  "subject": "Optional subject",
  "message": "Initial message content"
}
```

Behavior:

- Backend uses the resident's active occupancy to resolve the building automatically.
- If `managementUserId` is omitted, backend targets all assigned management users for that building.
- If `managementUserId` is provided, backend requires that user to be one of the allowed management contacts for that building and creates a private resident-to-selected-management conversation.
- Returns `403` if `managementUserId` is outside the resident's allowed management contact set.
- Returns `409` if the resident has no active occupancy or no management users are assigned.

## Create Resident -> Owner Conversation

`POST /resident/messages/owner`

```json
{
  "subject": "Optional subject",
  "message": "Initial message content"
}
```

Behavior:

- Backend uses the resident's active occupancy to resolve the resident's unit automatically.
- Backend resolves the current owner from active unit ownership, with fallback to `Unit.ownerId` only when no active ownership row exists.
- Backend targets the active linked owner user for that owner record.
- Returns `409` if:
  - the resident has no active occupancy
  - the unit has no current owner
  - the owner does not have active app access

## Conversation List

`GET /org/conversations`

Query params:

- `limit`: optional, `1..100`
- `cursor`: optional

Example response:

```json
{
  "items": [
    {
      "id": "conversation_uuid",
      "subject": "Lease question",
      "buildingId": "building_uuid",
      "participants": [
        {
          "id": "resident_user_uuid",
          "name": "Resident User",
          "avatarUrl": null
        },
        {
          "id": "owner_user_uuid",
          "name": "Owner User",
          "avatarUrl": null
        }
      ],
      "unreadCount": 1,
      "lastMessage": {
        "id": "message_uuid",
        "content": "Please confirm the renewal details.",
        "sender": {
          "id": "owner_user_uuid",
          "name": "Owner User",
          "avatarUrl": null
        },
        "createdAt": "2026-04-07T12:00:00.000Z"
      },
      "createdAt": "2026-04-07T11:00:00.000Z",
      "updatedAt": "2026-04-07T12:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

## Conversation Detail

`GET /org/conversations/:id`

Returns the full message thread only when the resident is a participant.

## Send Reply

`POST /org/conversations/:id/messages`

```json
{
  "content": "Thanks. Please share the next step."
}
```

## Mark Thread Read

`POST /org/conversations/:id/read`

Response:

```json
{
  "success": true
}
```

## Unread Badge

`GET /org/conversations/unread-count`

Response:

```json
{
  "unreadCount": 3
}
```

Use this endpoint for badges instead of summing unread locally from partially loaded pages.

## Realtime

Use the existing Socket.IO notifications connection and listen for:

- `conversation:new`
- `message:new`
- `conversation:read`

REST remains the source of truth. On reconnect, refetch conversation badges and any visible thread state.

## UI Mapping

### New Message Sheet

Show fixed choices:

- `Message Management`
- `Message Owner`

Do not show an arbitrary participant picker.

If you want a management picker, populate it only from `GET /resident/messages/management-contacts`.

### Inbox

Use:

- `GET /org/conversations`
- `GET /org/conversations/unread-count`

### Thread Screen

Use:

- `GET /org/conversations/:id`
- `POST /org/conversations/:id/messages`
- `POST /org/conversations/:id/read`

## Error Expectations

- `401` for missing or invalid token
- `403` when the route requires resident messaging permission and the caller does not have it
- `404` when the conversation is not visible to the current resident
- `409` when a new resident conversation cannot be created because active occupancy or a valid resolved recipient does not exist

## Practical Decision

For tenant mobile:

- keep `/org/conversations` for reading existing threads
- stop using `/org/conversations` for tenant conversation creation
- use `/resident/messages/management` and `/resident/messages/owner` for compose actions
