# Frontend Guide: Org-Wide Leases (All Residents, Past + Present)

Use this guide to integrate the new org-wide leases endpoint into the frontend.

## Goal
- Fetch leases across all residents in the org (both `ACTIVE` and `ENDED`)
- Support filters and cursor pagination
- Reuse existing lease details pages by linking with `leaseId`

## Endpoint
- `GET /api/org/leases`
- Permission: `leases.read`

Query params:
- `status=ACTIVE|ENDED|ALL` (default `ALL`)
- `buildingId` (optional)
- `unitId` (optional)
- `residentUserId` (optional)
- `q` (optional text search)
- `date_from` (optional ISO datetime, filters `leaseStartDate` lower bound inclusive)
- `date_to` (optional ISO datetime, filters `leaseStartDate` upper bound inclusive)
- `order=asc|desc` (sort by `leaseStartDate`, default `desc`)
- `cursor` (opaque string returned by previous page)
- `limit` (default `20`, max `100`)

## Response Shape
```json
{
  "items": [
    {
      "id": "lease_uuid",
      "status": "ACTIVE",
      "leaseStartDate": "2025-02-01T00:00:00.000Z",
      "leaseEndDate": "2026-02-01T00:00:00.000Z",
      "resident": {
        "id": "user_uuid",
        "name": "Resident Name",
        "email": "resident@example.com"
      },
      "unit": {
        "id": "unit_uuid",
        "label": "101"
      }
    }
  ],
  "nextCursor": "base64_cursor_or_null"
}
```

Notes:
- `items` are the same lease DTO used by `GET /api/org/leases/:leaseId`.
- Money fields are decimal strings; keep them as strings in UI/state.

## Suggested Frontend API Layer
```ts
export type OrgLeaseStatus = 'ACTIVE' | 'ENDED' | 'ALL';
export type SortOrder = 'asc' | 'desc';

export type ListOrgLeasesQuery = {
  status?: OrgLeaseStatus;
  buildingId?: string;
  unitId?: string;
  residentUserId?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  order?: SortOrder;
  cursor?: string;
  limit?: number;
};

export async function listOrgLeases(
  query: ListOrgLeasesQuery,
  accessToken: string,
) {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.buildingId) params.set('buildingId', query.buildingId);
  if (query.unitId) params.set('unitId', query.unitId);
  if (query.residentUserId) params.set('residentUserId', query.residentUserId);
  if (query.q) params.set('q', query.q);
  if (query.date_from) params.set('date_from', query.date_from);
  if (query.date_to) params.set('date_to', query.date_to);
  if (query.order) params.set('order', query.order);
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.limit) params.set('limit', String(query.limit));

  const res = await fetch(`/api/org/leases?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to load org leases (${res.status})`);
  }

  return res.json() as Promise<{
    items: LeaseResponseDto[];
    nextCursor?: string;
  }>;
}
```

## React Query Pattern (Recommended)
Use infinite query for cursor pagination.

```ts
const query = useInfiniteQuery({
  queryKey: ['org-leases', { status, order, limit }],
  queryFn: ({ pageParam }) =>
    listOrgLeases(
      { status, order, limit, cursor: pageParam as string | undefined },
      accessToken,
    ),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});
```

Flatten for rendering:
```ts
const leases = query.data?.pages.flatMap((p) => p.items) ?? [];
```

## UI Integration Suggestions
- Add an org-level `Leases` page/table.
- Default filter: `status=ALL`, `order=desc`.
- Show columns: resident, unit, status, lease dates, annual rent.
- Row click: navigate to existing lease details route using `leaseId`.
- Keep filter/sort in URL query params for shareable state.

## Relationship With Existing Lease Endpoints
- Use `GET /api/org/leases` for org-wide listing/search and dashboards.
- Use `GET /api/org/residents/:userId/leases` when already scoped to one resident.
- Use `GET /api/org/leases/:leaseId` for details view.
- Use timeline endpoints only when user opens history/timeline tabs.

## Error Handling
- `400`: invalid query params (show inline validation/toast)
- `403`: missing `leases.read` (show access denied state)
- `401`: session expired/invalid token (trigger auth flow)

## QA Checklist
- `ALL` returns both active and ended leases.
- `ACTIVE` returns only active leases.
- `ENDED` returns only ended leases.
- Pagination returns `nextCursor` until final page.
- Next page fetch with `cursor` appends without duplicates.
- User without `leases.read` gets `403` and proper UI state.
