You’re Codex. I need a follow-up “hardening + verification” pass on the realtime notifications work you just implemented.

Goal
- Make sure Socket.IO auth + org scoping + cursor pagination are 100% correct.
- Run tests and add 1–2 high-value e2e tests that catch the common bugs (wrong room scoping, cursor duplicates, read sync).

What to do

1) RUN TESTS
- Run unit/e2e tests (whatever exists) and report output.
- Fix any failures.

2) AUDIT + FIX: WebSocket auth + room scoping
In NotificationsGateway:
- Support JWT from ALL of:
  a) handshake.headers.authorization = "Bearer <token>"
  b) handshake.auth.token
  c) handshake.query.token
- Use the SAME JWT verification / auth service used for HTTP.
- Determine orgId consistently:
  - If orgId is in JWT claims, use it.
  - Else accept handshake.auth.orgId (or query.orgId) BUT validate membership in that org (or reject).
- Join ONLY: `org:${orgId}:user:${userId}`
- Ensure emits go ONLY to that room, never to org-wide or global broadcasts.

3) AUDIT + FIX: REST scoping + read events
NotificationsService / controllers:
- Every query/update must scope by BOTH orgId and userId from the auth context.
- POST /notifications/:id/read:
  - Update readAt only if null (idempotent).
  - If not found under orgId+userId => 404.
  - Emit `notifications:read { id, readAt }` to that user room after successful update.
- POST /notifications/read-all:
  - UpdateMany where readAt is null.
  - Emit `notifications:read_all { readAt }` to that user room.

4) AUDIT + FIX: Cursor pagination correctness
For GET /notifications:
- Ordering must be: createdAt DESC, id DESC.
- Cursor is base64 of `${createdAt.toISOString()}|${id}`.
- Decode safely; if invalid format/date => return 400.
- Pagination filter for DESC order must be:
  (createdAt < cursorCreatedAt) OR (createdAt = cursorCreatedAt AND id < cursorId)
- Ensure no duplicates across pages; ensure stable ordering even when createdAt ties.

5) AUDIT: createMany + realtime payload correctness
If createMany is used:
- Remember createMany doesn’t return rows.
- Ensure the payload emitted in `notifications:new` includes real DB values: id + createdAt.
- If needed, switch to per-user create in a loop (acceptable for small fanout) OR createMany + query-back with a safe strategy.
- Do not emit “synthetic” ids.

6) ADD E2E TESTS (high value)
Add at least these:
A) Cursor pagination test:
- Create 25 notifications with known timestamps (or sequential creation).
- Fetch page1 limit=10, then page2 with cursor, assert no overlap and correct ordering.
- Assert invalid cursor returns 400.
B) WebSocket delivery + scoping test (single instance):
- Start app in test env.
- Create user A in org1, user B in org2 (or org1 different user).
- Connect socket as user A, assert receives notifications:hello unreadCount.
- Trigger creation of a notification for user A/org1 and verify socket receives notifications:new.
- Trigger creation for other user/org and verify user A does NOT receive it.
(Use socket.io-client in tests.)

7) DOCS
Update NOTIFICATIONS_REALTIME.md to include:
- Exact connection example for Next.js and React Native (token via auth + fallback query)
- Reconnect strategy: on connect/reconnect call GET /notifications?unreadOnly=true&limit=50
- Cursor format + example

Output requirements
- Provide a concise summary of what you changed and why.
- List files changed.
- Paste test results.
- If anything is ambiguous (like how orgId is determined), stop and ask me BEFORE implementing that part, but continue with the rest.

Proceed.
