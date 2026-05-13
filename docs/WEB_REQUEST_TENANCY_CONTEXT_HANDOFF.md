# Web Handoff: Request Tenancy Context

Use this file for the web app integration of `requestTenancyContext` across management, provider, and owner request screens.

## Applies To

- `GET /org/buildings/:buildingId/requests`
- `GET /org/buildings/:buildingId/requests/:requestId`
- `GET /provider/requests`
- `GET /provider/requests/:requestId`
- `GET /owner/portfolio/requests`
- `GET /owner/portfolio/requests/:requestId`

## Backend Contract

Each request now returns:

- `occupancyIdAtCreation`
- `leaseIdAtCreation`
- `currentOccupancyId`
- `currentLeaseId`
- `isCurrentOccupancy`
- `isCurrentLease`
- `label`
- `leaseLabel`
- `tenancyContextSource`
- `leaseContextSource`

The new source fields are:

- `SNAPSHOT`
- `HISTORICAL_INFERENCE`
- `UNRESOLVED`

## Required Interpretation

Use this as the canonical meaning:

- `CURRENT_OCCUPANCY` / `CURRENT_LEASE`
  - operational current-cycle request

- `PREVIOUS_OCCUPANCY` / `PREVIOUS_LEASE`
  - request from an older stay or contract

- `NO_ACTIVE_OCCUPANCY` / `NO_ACTIVE_LEASE`
  - request from an older stay or contract where requester no longer has an active cycle

- `UNKNOWN_TENANCY_CYCLE` / `UNKNOWN_LEASE_CYCLE`
  - unresolved legacy context only
  - especially when paired with `*ContextSource = UNRESOLVED`

## What Changed

Previously, rows with missing creation snapshots often fell into `UNKNOWN_*` immediately.

Now backend behavior is:

- use stored snapshot IDs if present
- otherwise infer creation cycle from occupancy/lease history using request `createdAt`
- only return `UNKNOWN_*` when the cycle still cannot be resolved safely

This means active/open requests should now mostly classify as `CURRENT_*`, not `UNKNOWN_*`.

## Required UI Buckets

Use these buckets anywhere the web separates current operational work from history:

- `Operational Queue`
  - `label === CURRENT_OCCUPANCY`

- `Historical`
  - `label === PREVIOUS_OCCUPANCY`
  - `label === NO_ACTIVE_OCCUPANCY`

- `Legacy Context`
  - `label === UNKNOWN_TENANCY_CYCLE`
  - especially when `tenancyContextSource === UNRESOLVED`

Do not merge `UNKNOWN_*` into the same bucket as `PREVIOUS_*` unless product explicitly wants to hide unresolved legacy rows.

## Recommended Filtering Rules

For management dashboards, provider queues, and owner portfolio:

- default operational views should include `CURRENT_OCCUPANCY`
- optional historical filters should include `PREVIOUS_OCCUPANCY` and `NO_ACTIVE_OCCUPANCY`
- unresolved legacy filters should use `UNKNOWN_TENANCY_CYCLE`

If a lease-level sub-filter is needed:

- current lease filter -> `leaseLabel === CURRENT_LEASE`
- previous lease filter -> `leaseLabel === PREVIOUS_LEASE`
- no active lease filter -> `leaseLabel === NO_ACTIVE_LEASE`
- unresolved lease filter -> `leaseLabel === UNKNOWN_LEASE_CYCLE`

## Source-Aware Display Guidance

Use `tenancyContextSource` and `leaseContextSource` to explain why a row is classified the way it is:

- `SNAPSHOT`
  - stable, explicit creation linkage

- `HISTORICAL_INFERENCE`
  - backend reconstructed the original cycle from history
  - valid for classification
  - useful for tooltip or secondary text if product wants traceability

- `UNRESOLVED`
  - true legacy gap
  - should not be shown as a normal current or previous request without qualification

## Important Frontend Rules

- Do not use unit match alone to decide same cycle.
- Do not use tenant identity alone to decide same cycle.
- Same resident in the same unit can still be `PREVIOUS_OCCUPANCY` if the occupancy IDs differ.
- `isCurrentOccupancy` and `isCurrentLease` are useful convenience fields, but `label` and `leaseLabel` should remain the main classification source.

## Edge Case

Same resident moved out and later moved back in:

- old request can be:
  - `label = PREVIOUS_OCCUPANCY`
  - while requester is also the current occupant again
- this is expected and correct when `occupancyIdAtCreation !== currentOccupancyId`

## Suggested QA Cases

- current active resident request returns `CURRENT_OCCUPANCY`
- old request from prior stay returns `PREVIOUS_OCCUPANCY`
- old request where requester is fully moved out returns `NO_ACTIVE_OCCUPANCY`
- unresolved old row returns `UNKNOWN_TENANCY_CYCLE` and `tenancyContextSource = UNRESOLVED`
- same tenant moved back into same unit still shows old request as previous when occupancy IDs differ

## Example

```json
{
  "requestTenancyContext": {
    "occupancyIdAtCreation": null,
    "leaseIdAtCreation": null,
    "currentOccupancyId": "occ_2026",
    "currentLeaseId": "lease_2026",
    "isCurrentOccupancy": true,
    "isCurrentLease": true,
    "label": "CURRENT_OCCUPANCY",
    "leaseLabel": "CURRENT_LEASE",
    "tenancyContextSource": "HISTORICAL_INFERENCE",
    "leaseContextSource": "HISTORICAL_INFERENCE"
  }
}
```

Interpretation:

- request is operationally current
- snapshot was missing
- backend resolved it from history
