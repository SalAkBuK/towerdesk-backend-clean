# React Native: Realtime Notifications Integration

This guide shows how to connect your React Native app to Socket.IO
notifications and keep the UI in sync.

## What you are connecting to

- Namespace: `/notifications`
- Socket.IO path: default `/socket.io`
- Events:
  - `notifications:hello` -> `{ unreadCount }`
  - `notifications:new` -> `{ id, type, title, body, data, readAt, dismissedAt, createdAt }`
  - `notifications:read` -> `{ id, readAt }`
  - `notifications:read_all` -> `{ readAt }`
  - `notifications:dismiss` -> `{ id, dismissedAt }`
  - `notifications:undismiss` -> `{ id }`

## Install client dependency

```bash
npm install socket.io-client
```

For closed-app notifications, also register a remote push token with the backend.

## Base URLs (local)

Use a reachable host from the device:
- iOS simulator: `http://localhost:3001`
- Android emulator: `http://10.0.2.2:3001`
- Physical device: `http://<your-lan-ip>:3001`

Define once (example):

```ts
export const API_BASE_URL = 'http://10.0.2.2:3001/api';
export const WS_BASE_URL = 'http://10.0.2.2:3001';
```

## Connect from React Native

Create a helper, e.g. `src/lib/notificationsSocket.ts`:

```ts
import { io, Socket } from 'socket.io-client';
import { WS_BASE_URL } from '../config';

let socket: Socket | null = null;

export const connectNotifications = (token: string) => {
  if (socket) return socket;

  socket = io(`${WS_BASE_URL}/notifications`, {
    transports: ['websocket'],
    auth: { token },
  });

  socket.on('notifications:hello', ({ unreadCount }) => {
    console.log('unreadCount', unreadCount);
  });

  socket.on('notifications:new', (notification) => {
    console.log('notifications:new', notification);
  });

  return socket;
};

export const disconnectNotifications = () => {
  socket?.disconnect();
  socket = null;
};
```

## Register push token for closed-app alerts

After login, obtain an Expo push token in the app and register it:

```ts
await fetch(`${API_BASE_URL}/notifications/push-devices/register`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    provider: 'EXPO',
    token: expoPushToken,
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
  }),
});
```

On logout, unregister it:

```ts
await fetch(`${API_BASE_URL}/notifications/push-devices/unregister`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    token: expoPushToken,
  }),
});
```

If your client has trouble sending auth in RN, fallback to query token:

```ts
socket = io(`${WS_BASE_URL}/notifications?token=${encodeURIComponent(token)}`, {
  transports: ['websocket'],
});
```

## Hook into app lifecycle

Connect after login and disconnect on logout. Optionally handle backgrounding:

```ts
import { AppState } from 'react-native';

let appState = AppState.currentState;

AppState.addEventListener('change', (next) => {
  if (appState.match(/inactive|background/) && next === 'active') {
    // On resume, refetch unread to catch missed items.
  }
  appState = next;
});
```

## Reconnect strategy (important)

When the socket connects/reconnects, refetch unread notifications:

```
GET /api/notifications?unreadOnly=true&limit=50
```

## Marking read (REST)

- Mark one: `POST /api/notifications/:id/read`
- Mark all: `POST /api/notifications/read-all`
- WS emits `notifications:read` and `notifications:read_all` for UI sync.

## Dismiss (REST)

- Dismiss one: `POST /api/notifications/:id/dismiss`
- Restore: `POST /api/notifications/:id/undismiss`
- WS emits `notifications:dismiss` and `notifications:undismiss` for UI sync.

## UI handling (suggested)

- On `notifications:dismiss`, remove the item from the visible list immediately.
- If you support an "Include dismissed" filter, keep the item but mark it dismissed.
- On `notifications:undismiss`, re-add the item to the visible list.

## Cursor pagination (history view)

- Cursor format: base64 of `${createdAt.toISOString()}|${id}`
- Order: `createdAt DESC, id DESC`
- Example:
  ```
  GET /api/notifications?limit=20&cursor=<base64>
  ```

## Common pitfalls

- `localhost` only works on iOS simulator; use `10.0.2.2` on Android emulator.
- Use `auth: { token }` instead of query strings when possible.
- Store tokens in secure storage (Keychain/Keystore) and refresh on 401.
- Closed-app alerts require backend push to be enabled with `PUSH_PROVIDER=expo`.
