# React Native: Resident Visitors Integration

This guide shows how to connect the tenant mobile app to the resident
visitor APIs.

## What you are connecting to

Resident visitor endpoints:

- `POST /resident/visitors`
- `GET /resident/visitors`
- `GET /resident/visitors/:visitorId`
- `PATCH /resident/visitors/:visitorId`
- `POST /resident/visitors/:visitorId/cancel`

Rules enforced by the backend:

- The backend derives `buildingId` and `unitId` from the logged-in resident's
  active occupancy.
- The client must not send `unitId` or `buildingId`.
- Visitors are shared at the current unit level.
- Residents can edit visitor details, but cannot mark visitors `ARRIVED` or
  `COMPLETED`.
- Cancel is allowed only while the visitor is still `EXPECTED`.

## Base URL

Example:

```ts
export const API_BASE_URL = 'http://10.0.2.2:3001/api';
```

All examples below assume a JWT access token:

```ts
const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});
```

## Enums

Visitor types:

```ts
export type VisitorType =
  | 'GUEST_VISITOR'
  | 'DELIVERY_RIDER'
  | 'COURIER_PARCEL'
  | 'SERVICE_PROVIDER'
  | 'MAINTENANCE_TECHNICIAN'
  | 'HOUSEKEEPING_CLEANER'
  | 'CONTRACTOR_WORKER'
  | 'DRIVER_PICKUP'
  | 'SECURITY_STAFF_EXTERNAL'
  | 'OTHER';
```

Visitor statuses:

```ts
export type VisitorStatus =
  | 'EXPECTED'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED';
```

## Response shape

The resident endpoints return this shape:

```ts
export type Visitor = {
  id: string;
  buildingId: string;
  type: VisitorType;
  status: VisitorStatus;
  visitorName: string;
  phoneNumber: string;
  emiratesId: string | null;
  vehicleNumber: string | null;
  expectedArrivalAt: string | null;
  notes: string | null;
  unit: {
    id: string;
    label: string;
  };
  tenantName: string | null;
  createdAt: string;
  updatedAt: string;
};
```

## Create a visitor

Request body:

```ts
export type CreateResidentVisitorInput = {
  type: VisitorType;
  visitorName: string;
  phoneNumber: string;
  emiratesId?: string;
  vehicleNumber?: string;
  expectedArrivalAt?: string;
  notes?: string;
};
```

Example:

```ts
export async function createVisitor(
  token: string,
  input: CreateResidentVisitorInput,
): Promise<Visitor> {
  const response = await fetch(`${API_BASE_URL}/resident/visitors`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Create visitor failed: ${response.status}`);
  }

  return response.json();
}
```

## List visitors

Optional filter:

- `status=EXPECTED|ARRIVED|COMPLETED|CANCELLED`

Example:

```ts
export async function listVisitors(
  token: string,
  status?: VisitorStatus,
): Promise<Visitor[]> {
  const query = status
    ? `?status=${encodeURIComponent(status)}`
    : '';

  const response = await fetch(`${API_BASE_URL}/resident/visitors${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`List visitors failed: ${response.status}`);
  }

  return response.json();
}
```

## Get one visitor

```ts
export async function getVisitor(
  token: string,
  visitorId: string,
): Promise<Visitor> {
  const response = await fetch(
    `${API_BASE_URL}/resident/visitors/${visitorId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Get visitor failed: ${response.status}`);
  }

  return response.json();
}
```

## Update a visitor

Allowed fields:

```ts
export type UpdateResidentVisitorInput = Partial<{
  type: VisitorType;
  visitorName: string;
  phoneNumber: string;
  emiratesId: string;
  vehicleNumber: string;
  expectedArrivalAt: string;
  notes: string;
}>;
```

Important:

- Do not send `unitId`
- Do not send `status`

Example:

```ts
export async function updateVisitor(
  token: string,
  visitorId: string,
  input: UpdateResidentVisitorInput,
): Promise<Visitor> {
  const response = await fetch(
    `${API_BASE_URL}/resident/visitors/${visitorId}`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    throw new Error(`Update visitor failed: ${response.status}`);
  }

  return response.json();
}
```

## Cancel a visitor

Use the dedicated cancel endpoint instead of patching `status`.

```ts
export async function cancelVisitor(
  token: string,
  visitorId: string,
): Promise<Visitor> {
  const response = await fetch(
    `${API_BASE_URL}/resident/visitors/${visitorId}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Cancel visitor failed: ${response.status}`);
  }

  return response.json();
}
```

## Error handling

Important backend responses:

- `400 Bad Request`
  - invalid body
  - unknown fields like `unitId` or `status`
- `401 Unauthorized`
  - missing or expired token
- `403 Forbidden`
  - user has no org scope
- `404 Not Found`
  - visitor does not belong to the resident's current unit
- `409 Conflict`
  - resident has no active occupancy
  - resident has more than one active occupancy
  - trying to cancel a visitor that is not `EXPECTED`

## UI guidance

- Show only resident-owned-unit visitors from `GET /resident/visitors`.
- Treat `EXPECTED` as the editable state.
- Disable edit/cancel actions once status is `ARRIVED`, `COMPLETED`, or
  `CANCELLED`.
- If `409` is returned on create/list/get/update/cancel, show a message like:
  `Visitor management is only available when your account has one active unit.`

## Limitation to know

Resident visitor visibility is unit-scoped, not creator-scoped.

If occupancy changes later, new active residents of that unit can see the
unit's visitor records.
