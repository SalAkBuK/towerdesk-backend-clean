You are Codex working in the Towerdesk NestJS + TypeScript backend (Prisma + Postgres, JWT auth, RBAC permission keys). Implement **Phase 6B: In-app Notifications** for maintenance requests, using **Option A: tx-aware repo overloads** (optional `tx` param) only where needed. Keep scope minimal, follow existing patterns.

CONTEXT / CURRENT STATE
- Maintenance Requests Phase 6A exists with resident + building ops endpoints and manager/staff/building_admin rules.
- Org/User profile support exists (Org.logoUrl, User.avatarUrl/phone).
- QueueModule exists and exports:
  - QUEUE_CONNECTION (Redis | null)
  - QUEUE_DEFAULT (bullmq Queue | null), returns null when env.QUEUE_ENABLED=false
- We use PrismaService and $transaction in some repos, but repos generally don’t accept tx client params yet. For this phase, introduce a small tx-aware pattern only for the methods touched.

PHASE 6C GOAL
Add an **in-app notifications** system:
- DB model for notifications
- Notifications APIs: list, mark-read, mark-all-read
- Emit notifications on maintenance-request events:
  1) request created
  2) assigned
  3) status changed
  4) comment added
  5) canceled
- Ensure request mutations + notification inserts are **atomic** (same transaction).
- E2E coverage for main flows + access isolation.
- Update docs (README.md + API.md).

NON-GOALS
- Do NOT implement push notifications.
- Do NOT implement email sending in this phase.
- Do NOT implement Cloudinary, upload endpoints, staff directory.
- Queue integration is optional; if included, only enqueue “delivery” jobs AFTER commit and only when queue exists; do not build a worker unless it’s already expected.

DATA MODEL (Prisma)
Add a Notification table and enum:
- enum NotificationType:
  - REQUEST_CREATED
  - REQUEST_ASSIGNED
  - REQUEST_STATUS_CHANGED
  - REQUEST_COMMENTED
  - REQUEST_CANCELED
- model Notification:
  - id (uuid/cuid)
  - orgId
  - recipientUserId
  - type NotificationType
  - title String
  - body String? (nullable)
  - data Json (store: requestId, buildingId, unitId, actorUserId, status?, commentId?)
  - readAt DateTime? (nullable)
  - createdAt DateTime @default(now())
Indexes:
  - @@index([recipientUserId, createdAt])
  - @@index([orgId, recipientUserId])
Relations:
  - recipient -> User (FK)
  - orgId should match org scoping rules

Add migration.sql accordingly.

TX-AWARE PATTERN (OPTION A)
Introduce a shared type for transaction clients:
- Create a file (wherever shared types live) exporting:
  - `export type DbClient = PrismaService | Prisma.TransactionClient;`
In repos that need tx, implement optional param:
- function signature: `(..., tx?: DbClient)`
- use `(tx ?? this.prisma)` for queries.
Only apply this pattern to repos/methods touched by notifications emission in this phase.

MODULES / FILES TO ADD
Create a Notifications module:
- src/modules/notifications/notifications.module.ts
- src/modules/notifications/notifications.controller.ts
- src/modules/notifications/notifications.service.ts
- src/modules/notifications/notifications.repo.ts
- src/modules/notifications/dto/* (query DTOs, mark read DTOs)
Wire into app.module.ts.

NOTIFICATIONS API
Base: `/api/notifications`
All require JWT auth.

1) GET `/api/notifications`
Query:
- unreadOnly?: boolean
- cursor?: string (or createdAt cursor)
- limit?: number (use DEFAULT_PAGE_SIZE/MAX_PAGE_SIZE patterns if present)
Return:
- items: [{ id, type, title, body?, data, readAt?, createdAt }]
- nextCursor? (if cursor pagination)
Rules:
- Only return notifications for req.user.id and req.user.orgId.

2) POST `/api/notifications/:id/read`
- Marks a single notification as read (`readAt = now()`).
- If notification is not in user’s org or not owned by user, return 404.

3) POST `/api/notifications/read-all`
- Marks all unread notifications for user as read.

PAGINATION
Implement cursor-based pagination if the codebase already has a pattern; otherwise implement `take` + `cursor` by `(createdAt,id)` ordering. Keep simple.

EMISSION RULES (RECIPIENTS)
Implement in NotificationsService as helper methods called from MaintenanceRequestsService actions.

Recipients:
A) When resident creates a request:
- notify building assignments: BUILDING_ADMIN + MANAGER for that building
- do NOT notify all STAFF
- if it is immediately assigned (unlikely), also notify assigned staff
B) When request is assigned:
- notify assigned staff (assignedToUserId)
- notify resident (createdByUserId)
- notify building admins/managers (optional; include if easy)
C) When status changes:
- notify resident (createdByUserId)
- notify assigned staff only if actor is not the assigned staff (optional; keep minimal: just resident)
D) When comment is added:
- if actor is resident: notify building admins/managers AND assigned staff (if assigned)
- if actor is ops/staff: notify resident; additionally notify assigned staff if not actor (optional)
E) When canceled:
- notify building admins/managers and assigned staff (if assigned)
Do not send notifications to the actor (no “you commented”).
Avoid duplicates (use a Set of userIds).

TITLE/BODY CONTENT (MVP)
Keep predictable:
- REQUEST_CREATED: title "New maintenance request", body "Unit <label>: <title>"
- REQUEST_ASSIGNED: title "Request assigned", body "Unit <label>: <title>"
- REQUEST_STATUS_CHANGED: title "Request status updated", body "<STATUS>"
- REQUEST_COMMENTED: title "New comment", body truncated message (e.g. 80 chars)
- REQUEST_CANCELED: title "Request canceled", body "Unit <label>: <title>"
Store deep-link targets in data JSON: { requestId, buildingId, unitId, actorUserId, status?, commentId? }

ATOMICITY REQUIREMENT
For each maintenance request mutation endpoint:
- Wrap the mutation + notification creation in a single Prisma `$transaction(async (tx) => { ... })`.
- Update repo methods invoked inside the transaction to accept `tx?: DbClient` (Option A).
- NotificationsRepo.createMany(...) must accept tx and be called inside tx.
Queue enqueue (if implemented) must happen AFTER transaction commit:
- only if injected queue is not null and env flags allow.
- do NOT build email delivery; just enqueue job stubs is acceptable or skip entirely.

INTEGRATION POINTS
Update MaintenanceRequestsService methods for:
- create request
- assign
- update status
- add comment
- cancel
They should:
1) do mutation (tx)
2) compute recipients (tx reads ok)
3) insert notifications (tx)
Return normal response.

NOTIFICATIONS REPO
Implement:
- createMany(notifs, tx?)
- listForUser(userId, orgId, pagination)
- markRead(notificationId, userId, orgId)
- markAllRead(userId, orgId)

E2E TESTS (REQUIRED)
Add test suite: test/notifications.e2e.spec.ts (or multiple if preferred)
Seed test data similar to Phase 6A suites:
- org, building, unit
- users: org_admin, manager, building_admin, staff, resident
- assignments: manager/building_admin/staff to building
- occupancy: resident active in unit

Test cases:
1) Resident creates request -> manager and building_admin receive REQUEST_CREATED notifications; resident does not.
2) Building_admin assigns staff -> staff and resident receive REQUEST_ASSIGNED notifications.
3) Assigned staff sets IN_PROGRESS -> resident receives REQUEST_STATUS_CHANGED.
4) Resident comments -> manager/building_admin + assigned staff get REQUEST_COMMENTED; resident doesn’t.
5) Mark single read -> unreadOnly filter excludes it.
6) Mark all read -> unreadOnly returns empty.
7) Cross-org isolation -> user from another org cannot read/mark someone else’s notifications (404).

DOCS
Update README.md + API.md:
- Add Notifications section:
  - GET /api/notifications
  - POST /api/notifications/:id/read
  - POST /api/notifications/read-all
- Explain notification types and when they are emitted for maintenance requests.
- Mention actorUserId and requestId in data JSON for frontend deep-linking.

CONSTRAINTS
- Keep changes minimal; follow existing naming conventions and folder structure.
- Do not introduce a large refactor to repos beyond optional tx parameter for touched methods.
- Ensure `npm run test` passes and Prisma migrations apply.
- Ensure all notification queries are org-scoped and user-owned (no leaks).

Implement now.
