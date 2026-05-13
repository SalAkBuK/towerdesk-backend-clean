# Mobile Handoff: Request Tenancy Context

Use this file for the React Native mobile app integration of `requestTenancyContext` on request screens.

## Scope

- Applies to resident request create/list/detail/update/cancel responses, owner request screens, building requests, and provider requests.
- Backend behavior is now consistent across resident, owner portfolio, building, and provider request surfaces.

## Response Fields

Each request can now return:

- `requestTenancyContext.occupancyIdAtCreation`
- `requestTenancyContext.leaseIdAtCreation`
- `requestTenancyContext.currentOccupancyId`
- `requestTenancyContext.currentLeaseId`
- `requestTenancyContext.isCurrentOccupancy`
- `requestTenancyContext.isCurrentLease`
- `requestTenancyContext.label`
- `requestTenancyContext.leaseLabel`
- `requestTenancyContext.tenancyContextSource`
- `requestTenancyContext.leaseContextSource`

## Label Meanings

- `CURRENT_OCCUPANCY`: request belongs to the requester's current stay.
- `PREVIOUS_OCCUPANCY`: request belongs to an older stay.
- `NO_ACTIVE_OCCUPANCY`: request belongs to an older stay and the requester currently has no active stay.
- `UNKNOWN_TENANCY_CYCLE`: backend could not safely determine the creation occupancy cycle.

- `CURRENT_LEASE`: request belongs to the requester's current lease.
- `PREVIOUS_LEASE`: request belongs to an older lease.
- `NO_ACTIVE_LEASE`: request belongs to an older lease and the requester currently has no active lease.
- `UNKNOWN_LEASE_CYCLE`: backend could not safely determine the creation lease cycle.

## Source Meanings

- `SNAPSHOT`: backend used stored `occupancyIdAtCreation` or `leaseIdAtCreation`.
- `HISTORICAL_INFERENCE`: stored snapshot was missing, but backend resolved the cycle from occupancy/lease history using the request creation time.
- `UNRESOLVED`: backend could not safely resolve the cycle. This is the true legacy-gap bucket.

## Required Frontend Rules

- Do not treat `UNKNOWN_*` as generic history anymore.
- Do not infer current vs previous from tenant name alone.
- Do not infer same cycle from same unit alone.
- Trust the backend cycle classification first. Use requester name only as supporting UI text.

## Owner List Grouping

Use this grouping for owner request sections:

- `Current Occupancy Requests`
  - `label === CURRENT_OCCUPANCY`

- `Previous / Legacy Requests`
  - `label === PREVIOUS_OCCUPANCY`
  - `label === NO_ACTIVE_OCCUPANCY`

- `Unclassified Requests`
  - `label === UNKNOWN_TENANCY_CYCLE`
  - especially when `tenancyContextSource === UNRESOLVED`

If your current grouping code sends `UNKNOWN_TENANCY_CYCLE` into the historical bucket, change it. That hides the difference between true old-cycle requests and unresolved legacy rows.

## Badge Rules

Recommended occupancy badge mapping:

- `CURRENT_OCCUPANCY` -> `Current Stay`
- `PREVIOUS_OCCUPANCY` -> `Previous Stay`
- `NO_ACTIVE_OCCUPANCY` -> `Original Requester Moved Out`
- `UNKNOWN_TENANCY_CYCLE` + `UNRESOLVED` -> `Legacy Stay`

Recommended lease badge mapping:

- `CURRENT_LEASE` -> `Current Lease`
- `PREVIOUS_LEASE` -> `Previous Lease`
- `NO_ACTIVE_LEASE` -> `Original Lease Ended`
- `UNKNOWN_LEASE_CYCLE` + `UNRESOLVED` -> `Legacy Lease`

Requester-presence badge:

- `currentOccupancyId && currentOccupancyId === occupancyIdAtCreation` -> `Original Requester Is Occupant`
- `currentOccupancyId && currentOccupancyId !== occupancyIdAtCreation` -> no current-stay badge
- `label === NO_ACTIVE_OCCUPANCY` -> `Original Requester Moved Out`

## Important Edge Case

Same resident moved out and later moved back into the same unit:

- old request should still be treated as previous if:
  - `occupancyIdAtCreation !== currentOccupancyId`
  - or `leaseIdAtCreation !== currentLeaseId`
- the UI may legitimately show:
  - section: `Previous / Legacy Requests`
  - badge: `Previous Stay`
  - badge: `Original Requester Is Occupant`

That means the same person is back, but the request belongs to an older stay.

## Suggested UI Priority

For grouping and filtering:

1. `label`
2. `tenancyContextSource`

For lease-specific secondary badges:

1. `leaseLabel`
2. `leaseContextSource`

## Minimal Implementation Checklist

- Update owner request grouping to move unresolved `UNKNOWN_TENANCY_CYCLE` into `Unclassified Requests`.
- Update request badges to use the new source fields.
- Keep current-vs-previous logic based on occupancy/lease IDs, not tenant identity.
- Avoid collapsing `PREVIOUS_*` and `UNKNOWN_*` into the same visual treatment.

## Example

```json
{
  "requestTenancyContext": {
    "occupancyIdAtCreation": "occ_old",
    "leaseIdAtCreation": "lease_old",
    "currentOccupancyId": "occ_new",
    "currentLeaseId": "lease_new",
    "isCurrentOccupancy": false,
    "isCurrentLease": false,
    "label": "PREVIOUS_OCCUPANCY",
    "leaseLabel": "PREVIOUS_LEASE",
    "tenancyContextSource": "SNAPSHOT",
    "leaseContextSource": "SNAPSHOT"
  }
}
```

Interpretation:

- request belongs to an older stay
- request belongs to an older lease
- requester may still be in the unit now, but on a different stay
