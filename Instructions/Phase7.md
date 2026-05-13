You are Codex acting as a senior backend engineer. Implement live “instant” notifications using WebSockets on a single-instance NestJS + Prisma + Postgres backend, keeping the existing REST endpoints as the source of truth.

Context / Existing REST API (do NOT break):
- GET /notifications?unreadOnly=true?&cursor?&limit?
  Returns: { items: [{ id, type, title, body?, data, readAt?, createdAt }], nextCursor? }
  Must only return notifications for the current user AND org.
- POST /notifications/:id/read
  Marks one notification as read. Return { success: true }.
  404 if notification not owned by user/org.
- POST /notifications/read-all
  Marks all unread notifications for the user as read. Return { success: true }.
Notification types:
- REQUEST_CREATED, REQUEST_ASSIGNED, REQUEST_STATUS_CHANGED, REQUEST_COMMENTED, REQUEST_CANCELED
Notification.data JSON includes: requestId, buildingId, unitId, actorUserId, optional status, commentId

Goal:
- Add WebSockets so notifications appear instantly in Next.js and React Native clients.
- Reliability: notifications are persisted in DB; on socket connect/reconnect clients can refetch unread via REST to avoid missing events.
- Single instance deployment (no Redis required).

Tech constraints:
- NestJS + Prisma + Postgres.
- Use Socket.IO (preferred for RN + web) via @nestjs/websockets.
- Auth: JWT like the rest of the API. WebSocket must authenticate and know userId + orgId; scope messages to only that user+org.

Deliverables:
1) Prisma schema updates
2) Notification module (service/controller/gateway)
3) Integration points (events emitted from maintenance request flows)
4) Cursor pagination for GET /notifications
5) WS events: notifications:new (+ optional read events)
6) Basic tests or at least clear notes + manual test steps
7) Keep code clean and consistent with existing project structure

Implementation details to follow:

A) Prisma Model
Create/confirm a Notification model like:
- id String @id @default(cuid())
- orgId String
- userId String   // recipient
- type String or enum NotificationType
- title String
- body String?
- data Json       // requestId/buildingId/unitId/actorUserId/status/commentId
- readAt DateTime?
- createdAt DateTime @default(now())
Indexes:
- @@index([orgId, userId, createdAt])
- @@index([orgId, userId, readAt, createdAt])
(If your schema uses BigInt/uuid, match existing conventions.)

B) REST endpoints (implement if missing / adjust if needed)
GET /notifications:
- Params: unreadOnly (boolean), cursor (string), limit (int default 20 max 100)
- Order: createdAt DESC, tie-breaker by id DESC
- Cursor-based pagination:
  - Cursor should encode (createdAt,id) of last item.
  - Return nextCursor if more results.
- Filter by orgId + userId from auth context.
POST /notifications/:id/read:
- Update readAt = now if currently null.
- 404 if not found in orgId+userId scope.
POST /notifications/read-all:
- UpdateMany where orgId+userId and readAt is null, set readAt = now.

C) WebSocket Gateway
Create NotificationsGateway using Socket.IO:
- Namespace: /ws (or /notifications) — pick one and document it.
- On connection:
  - Read JWT from Authorization header: “Bearer <token>” OR from query param token (support both for RN).
  - Validate token using the same auth service/strategy you use for HTTP.
  - Extract userId + orgId.
  - Join room: `org:${orgId}:user:${userId}`
- Server emits:
  - event: `notifications:new` payload: NotificationDTO (id,type,title,body,data,readAt,createdAt)
  - OPTIONAL: `notifications:read` { id, readAt }
  - OPTIONAL: `notifications:read_all` { readAt }
- Provide a NotificationsRealtimeService with method:
  - publishToUser(orgId, userId, event, payload)
  This service is injected into NotificationService so when a notification row is created, it is pushed immediately.

D) Create NotificationService API
Methods:
- createForUsers({ orgId, userIds, type, title, body?, data })
  - bulk create notifications (createMany if possible)
  - then emit to each connected user room with `notifications:new`
  - return created items (or minimal)
- markRead(orgId, userId, id)
- markReadAll(orgId, userId)
- list(orgId, userId, unreadOnly, cursor, limit)

E) Integration Points (maintenance request domain events)
Add a lightweight event bus pattern using @nestjs/event-emitter OR simple internal service calls.
Preferred: @nestjs/event-emitter
- Emit events on maintenance request actions:
  - REQUEST_CREATED
  - REQUEST_ASSIGNED
  - REQUEST_STATUS_CHANGED
  - REQUEST_COMMENTED
  - REQUEST_CANCELED
Event payload must include: requestId, buildingId, unitId, actorUserId, optional status/commentId, orgId
Then a NotificationsListener handles each event:
- Determine recipients (implement a placeholder with TODOs if recipient logic depends on missing models)
  - For now, implement a simple conservative rule:
    - Notify “building managers/staff assigned” if such relations exist; otherwise fallback to notifying org admins.
  - IMPORTANT: exclude actorUserId from recipients (don’t notify the actor), unless there are no other recipients.
- Create notifications via NotificationService.createForUsers

If recipient logic is hard due to unknown schema, implement:
- a RecipientResolver service with clearly marked TODOs + stub using existing tables (UserRole / BuildingAssignment / etc if present)
- ensure code compiles and tests pass even if resolver is naive.

F) DTOs / Validation
- Use class-validator/class-transformer for query params.
- Ensure NotificationDTO matches REST response contract.

G) Client notes (short doc in repo)
Add a short markdown doc:
- How to connect:
  - socket.io client to namespace
  - pass token
  - listen for notifications:new
- Reconnect strategy: on connect/reconnect call GET /notifications?unreadOnly=true&limit=50

H) Manual test checklist
- Create a notification via a fake endpoint or by triggering a maintenance action
- Confirm DB row created
- With a WS client connected, confirm immediate `notifications:new`
- Disconnect WS, trigger notifications, reconnect; confirm GET /notifications returns missed items
- Mark read via REST and verify scoping (wrong user/org gets 404)

Project conventions:
- Follow existing folder structure (src/modules/notifications or similar).
- Use dependency injection, keep services small, avoid circular deps.
- Don’t introduce Redis since single instance.
- Don’t break existing auth.

Output:
- Provide the exact files changed/added with code.
- Include Prisma schema diff and any migration steps.
- Include any new env vars if needed (should be none besides existing JWT secret).
