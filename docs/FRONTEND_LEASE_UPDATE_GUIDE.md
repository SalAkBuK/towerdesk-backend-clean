# Frontend Guide: Lease Edit + History Integration

Use this guide to implement lease editing and lease change history in frontend apps.

## Scope
- Edit an existing lease
- Save only changed fields
- Show lease change history timeline

## Endpoints
- `GET /api/org/leases/:leaseId`
  - Purpose: load lease details for form prefill
  - Permission: `leases.read`
- `PATCH /api/org/leases/:leaseId`
  - Purpose: update lease fields partially
  - Permission: `leases.write`
- `GET /api/org/leases/:leaseId/history`
  - Purpose: fetch field-level history entries (`CREATED`, `UPDATED`, `MOVED_OUT`)
  - Permission: `leases.read`
- `GET /api/org/residents/:userId/leases`
  - Purpose: list resident leases (active + old) for discovery/history navigation
  - Permission: `leases.read`
- `GET /api/org/residents/:userId/leases/timeline`
  - Purpose: resident-level timeline across all leases (active + old)
  - Permission: `leases.read`
- `GET /api/org/leases/:leaseId/timeline`
  - Purpose: unified lease timeline (field changes + activity events)
  - Permission: `leases.read`

## Editable Fields
Send only changed fields in `PATCH`:
- `leaseStartDate`, `leaseEndDate` (ISO datetime strings)
- `tenancyRegistrationExpiry`, `noticeGivenDate` (ISO datetime or `null`)
- `annualRent`, `securityDepositAmount`, `firstPaymentAmount`, `depositReceivedAmount` (decimal strings)
- `paymentFrequency`, `numberOfCheques`
- `internetTvProvider`, `notes` (string or `null`)
- `serviceChargesPaidBy`, `vatApplicable`
- `firstPaymentReceived`, `depositReceived`

## Frontend Rules
- Block submit if no fields changed.
- Validate `leaseEndDate > leaseStartDate` before submit.
- Keep money fields as strings (do not cast to float).
- For nullable fields, send explicit `null` when user clears value.

## Suggested Data Layer
Implement 5 API calls:

```ts
getLease(leaseId: string)
patchLease(leaseId: string, payload: Partial<LeasePatchPayload>)
getLeaseHistory(leaseId: string)
getResidentLeaseTimeline(residentUserId: string, query?: TimelineQuery)
getLeaseTimeline(leaseId: string, query?: LeaseTimelineQuery)
```

If you use React Query:
- Query key: `['lease', leaseId]`
- History key: `['lease-history', leaseId]`
- Timeline key: `['lease-timeline', leaseId, query]`
- Resident timeline key: `['resident-lease-timeline', residentUserId, query]`
- On patch success: invalidate both keys.

## Example PATCH Payload
```json
{
  "leaseEndDate": "2026-06-01T00:00:00.000Z",
  "paymentFrequency": "QUARTERLY",
  "numberOfCheques": 4,
  "notes": "Renewed terms"
}
```

## History Response Shape (What to Render)
Each history item includes:
- `action` (`CREATED`, `UPDATED`, `MOVED_OUT`)
- `createdAt`
- `changedByUser` (nullable)
- `changes` object:
  - `{ "fieldName": { "from": <value|null>, "to": <value|null> } }`

Example:
```json
{
  "action": "UPDATED",
  "changes": {
    "notes": { "from": null, "to": "Renewed terms" },
    "numberOfCheques": { "from": null, "to": 4 }
  }
}
```

## UI Recommendations
- Lease Details page:
  - `Details` tab
  - `Edit` action (drawer/modal/page)
  - `History` tab (timeline/table)
- History item display:
  - Header: action + date + actor
  - Body: list of changed fields as `from -> to`

## Error Handling
- `400`: invalid payload/date range -> inline errors + toast
- `403`: permission denied -> show access message
- `404`: lease not found or out of org scope -> not found state

## Manual QA Checklist
- Edit one field and save; verify success.
- Confirm `GET /history` shows new `UPDATED` entry.
- Submit with no changes; verify submit is blocked.
- Enter invalid date range; verify submit blocked.
- Verify `leases.write` missing user gets `403` on PATCH.
- Verify `leases.read` missing user gets `403` on history.
- Open resident timeline and verify `CREATED/UPDATED/MOVED_OUT` entries across old + active leases.
- Open lease timeline and verify activity events (document/access card/sticker/occupants/move-in/out) appear with source `ACTIVITY`.

## Long-Term Plan (Recommended)
Use phased delivery to avoid fragmented history UX.

### Phase 1: Resident Lease List (Active + Old)
Goal: make it easy to find moved-out residents old leases.

Proposed endpoint:
- `GET /api/org/residents/:userId/leases`

Proposed query params:
- `status=ACTIVE|ENDED|ALL` (default: `ALL`)
- `cursor` (optional)
- `limit` (optional, default 20, max 100)
- `order=asc|desc` by `leaseStartDate` (default `desc`)

Suggested response:
```json
{
  "items": [
    {
      "leaseId": "uuid",
      "status": "ENDED",
      "leaseStartDate": "2024-01-01T00:00:00.000Z",
      "leaseEndDate": "2025-01-01T00:00:00.000Z",
      "actualMoveOutDate": "2024-12-15T00:00:00.000Z",
      "building": { "id": "uuid", "name": "Tower A" },
      "unit": { "id": "uuid", "label": "1204" },
      "occupancyId": "uuid"
    }
  ],
  "nextCursor": "base64cursor"
}
```

Frontend usage:
- Add `Resident Leases` panel/tab in resident profile.
- Clicking an item routes to lease details + existing `History` tab.

### Phase 2: Unified Lease Timeline
Goal: single timeline that includes both field diffs and related lease activities.

Proposed endpoint:
- `GET /api/org/leases/:leaseId/timeline`

Proposed query params:
- `cursor`, `limit`
- `types` (optional array filter)

Event types (v1):
- `LEASE_CREATED`
- `LEASE_UPDATED`
- `LEASE_MOVED_OUT`
- `DOCUMENT_ADDED`
- `DOCUMENT_DELETED`
- `ACCESS_CARD_ISSUED`
- `ACCESS_CARD_STATUS_CHANGED`
- `PARKING_STICKER_ISSUED`
- `PARKING_STICKER_STATUS_CHANGED`
- `OCCUPANTS_REPLACED`

Suggested timeline item shape:
```json
{
  "id": "evt_123",
  "type": "LEASE_UPDATED",
  "createdAt": "2026-02-19T12:34:56.000Z",
  "actor": { "id": "user_id", "name": "Jane Admin", "email": "jane@org.com" },
  "payload": {
    "changes": {
      "notes": { "from": null, "to": "Renewed terms" }
    }
  }
}
```

Frontend usage:
- Replace separate history sources with one timeline feed.
- Support filters by event type and date range.

## Release Safety Checklist (Avoid 404 Mismatches)
- Deploy latest backend commit.
- Run DB migrations on target env.
- Build and restart process (`dist` must match latest source).
- Smoke test endpoint after deploy:
  - `GET /api/org/leases/:leaseId/history`
  - Later: `GET /api/org/residents/:userId/leases` and `/timeline`

## Suggested Implementation Order
1. Backend `GET /org/residents/:userId/leases` contract.
2. Frontend Resident Leases tab.
3. Backend unified timeline endpoint.
4. Frontend migrate history UI to timeline.
