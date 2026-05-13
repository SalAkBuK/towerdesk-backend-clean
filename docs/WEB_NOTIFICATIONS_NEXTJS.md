# Next.js Web App: Realtime Notifications Integration

This guide shows how to connect your Next.js web app to the Socket.IO
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

## Connect from Next.js (client-only)

Create a small client helper, e.g. `src/lib/notificationsSocket.ts`:

```ts
import { io, Socket } from 'socket.io-client';

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL ?? 'http://localhost:3001';

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

Usage in a client component (e.g. `app/(dashboard)/layout.tsx`):

```tsx
'use client';

import { useEffect } from 'react';
import { connectNotifications, disconnectNotifications } from '@/lib/notificationsSocket';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const token = window.localStorage.getItem('accessToken');
    if (!token) return;

    connectNotifications(token);

    return () => {
      disconnectNotifications();
    };
  }, []);

  return <>{children}</>;
}
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

- Do not connect during SSR; connect in a client component only.
- Use `auth: { token }` instead of query strings in the browser.
