# Realtime Notifications (WebSocket)

This backend emits realtime notification events over Socket.IO.
REST remains the source of truth; clients should refetch unread on reconnect.

## Connect

Namespace: `/notifications`
Socket.IO path: default `/socket.io` (not customized)

Auth:
- `Authorization: Bearer <accessToken>` header, OR
- query param `?token=<accessToken>` (useful for React Native)
- Socket auth payload: `{ token, orgId? }`
  - `orgId` is only needed when the token has no orgId (platform users).

On connect, the server emits:
- `notifications:hello` `{ unreadCount }`

## OrgId selection rules (WS)

- If the JWT includes `orgId`, that value is used.
- If the JWT has no orgId (platform users), you may pass `orgId` via
  `socket.auth.orgId` or `?orgId=...` to select an org.
- The server validates membership and rejects mismatches.

## CORS (WebSocket)

- Configure allowed origins via `WS_CORS_ORIGINS` (comma-separated).
- In development/test, an empty value allows `*`.
- In production, set explicit origins.

## Events

- `notifications:new`
  - Payload: `{ id, type, title, body, data, readAt, dismissedAt, createdAt }`
- `notifications:read`
  - Payload: `{ id, readAt }`
- `notifications:read_all`
  - Payload: `{ readAt }`
- `notifications:dismiss`
  - Payload: `{ id, dismissedAt }`
- `notifications:undismiss`
  - Payload: `{ id }`

## Recommended client flow

1) Connect socket.
2) Listen for `notifications:hello` and set badge.
3) Listen for `notifications:new` and update UI.
4) On connect/reconnect, call:
   - `GET /notifications?unreadOnly=true&limit=50`
5) Cursor format (for paging):
   - base64 of `${createdAt.toISOString()}|${id}`
   - example: `MjAyNS0wMS0wMVQwMDowMDowMC4wMDBafDEyMy00NTY=`

## Example: Next.js (socket.io-client)

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/notifications', {
  transports: ['websocket'],
  auth: { token: accessToken },
});

socket.on('notifications:hello', ({ unreadCount }) => {
  setBadge(unreadCount);
});

socket.on('notifications:new', (notification) => {
  addNotification(notification);
});
```

## Example: React Native (token query fallback)

```ts
import { io } from 'socket.io-client';

const socket = io(
  `http://localhost:3000/notifications?token=${encodeURIComponent(accessToken)}`,
  { transports: ['websocket'] },
);
```

## Proxy config (nginx/ALB/Cloudflare)

Required headers for upgrade:
- `Upgrade: websocket`
- `Connection: Upgrade`
- `Host` (forwarded)

Recommended timeouts:
- proxy read/send timeout: 60s+
- idle timeout: 60s+

Example nginx snippet:

```nginx
location /socket.io/ {
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "Upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 60s;
  proxy_send_timeout 60s;
  proxy_pass http://127.0.0.1:3000;
}
```

Sticky sessions are not required for single-instance deployments.

## Smoke test

Run a lightweight WS check:

```bash
WS_SMOKE_TOKEN="<jwt>" npm run ws:smoke
```

Optional overrides:
- `API_BASE_URL` (default `http://localhost:3000/api`)
- `WS_BASE_URL` (default `http://localhost:3000`)

## Manual test checklist

- Trigger a maintenance request action (create/assign/status/comment/cancel).
- Confirm a notification row exists in Postgres.
- With a WS client connected, confirm `notifications:new` arrives instantly.
- Disconnect WS, trigger notifications, reconnect, then confirm REST returns missed items.
- Mark read via REST; confirm `notifications:read` / `notifications:read_all` fires and scoping is enforced.
