# Dashboard Review

## Scope

- Source: `src/modules/dashboard`
- Main files:
  - `dashboard.controller.ts`
  - `dashboard.service.ts`
  - `dashboard.constants.ts`
  - `dto/dashboard-activity.query.dto.ts`
  - `dto/dashboard-activity.response.dto.ts`
  - `dto/dashboard-overview.response.dto.ts`
- Public routes:
  - `GET /org/dashboard/overview`
  - `GET /org/dashboard/activity`
- Core responsibility: aggregate org metrics and recent activity into lightweight dashboard responses.

## What This Module Really Owns

- Org-level summary KPIs and building metrics.
- Trends for maintenance, visitors, and broadcasts.
- A merged activity feed across multiple domains.
- Dashboard-specific query limits and date windows.

## Step-By-Step Request Flows

### 1. Get overview

1. Controller accepts `GET /org/dashboard/overview`.
2. Guards: `JwtAuthGuard`, `OrgScopeGuard`, `PermissionsGuard`.
3. Requires `dashboard.read`.
4. Service validates org scope and user identity.
5. Determines date boundaries:
   - trend window: `DASHBOARD_TREND_DAYS` (30 days)
   - overdue maintenance cutoff: `DASHBOARD_MAINTENANCE_OVERDUE_HOURS` (72 hours)
6. Loads building list for org (name + id).
7. If no buildings exist, returns zeroed summary and empty trend sets.
8. Executes parallel queries:
   - unit count per building
   - active occupancy count per building
   - active lease count per building
   - open maintenance requests per building
   - parking slot count per building
   - active parking allocations per building
   - visitor rows within trend window
   - maintenance rows within trend window
   - broadcast rows within trend window
   - overdue maintenance count
   - unread notifications count for current user
9. Computes summary KPIs:
   - totals, occupancy rate, today’s visitors, active parking, etc.
10. Builds trends for maintenance created/completed, visitors, broadcasts.
11. Builds per-building metrics:
    - total units, occupied units, vacancies, occupancy rate
    - open maintenance
    - active parking allocations
    - total parking slots
12. Returns `generatedAt`, `summary`, `trends`, `buildings`.

### 2. Get recent activity

1. Controller accepts `GET /org/dashboard/activity`.
2. Requires `dashboard.read`.
3. Validates org scope and user identity.
4. `limit` query is bounded to `[1, 100]`, default `DASHBOARD_ACTIVITY_LIMIT` (20).
5. Calculates activity window: `DASHBOARD_ACTIVITY_DAYS` (14 days).
6. Loads recent events from:
   - maintenance requests
   - visitors
   - broadcasts
   - parking allocations (start/end)
   - leases
7. Maps each record to one or more activity items:
   - maintenance: created, completed, canceled
   - visitors: registered
   - broadcasts: sent
   - parking: allocated, ended
   - leases: created
8. Merges items, sorts by `occurredAt` descending.
9. Returns the top `limit` items with `nextCursor = null` (no pagination).

## Read Models And Response Shapes

### Overview response

- `generatedAt`
- `summary`
  - `buildingsTotal`
  - `unitsTotal`
  - `occupiedUnits`
  - `vacantUnits`
  - `occupancyRate`
  - `activeLeases`
  - `openMaintenanceRequests`
  - `overdueMaintenanceRequests`
  - `visitorsToday`
  - `activeParkingAllocations`
  - `broadcastsLast30Days`
  - `unreadNotifications`
- `trends`
  - maintenance: per-day `created` + `completed`
  - visitors: per-day `created`
  - broadcasts: per-day `sent` + `recipientCount`
- `buildings[]`
  - `buildingId`, `buildingName`
  - unit and occupancy metrics
  - parking metrics
  - open maintenance count

### Activity response

- `items[]` ordered by `occurredAt` descending.
- Each item includes:
  - `type`
  - `title`
  - `description` (optional)
  - `entityType`, `entityId`
  - `buildingId`, `buildingName` (optional)
  - `occurredAt`
  - `metadata` (optional)
- `nextCursor` always `null` (no paging implemented).

## Validation And Defaults

### Overview defaults

- Trend window = 30 days (`DASHBOARD_TREND_DAYS`).
- Activity window = 14 days (`DASHBOARD_ACTIVITY_DAYS`).
- Maintenance overdue threshold = 72 hours.
- No buildings -> zeroed summary and empty trend series.

### Activity defaults

- `limit` defaults to `DASHBOARD_ACTIVITY_LIMIT` (20).
- `limit` is clamped to `[1, 100]`.
- Activity is limited to the last 14 days.

## Data And State Model

### Core tables queried

- `Building`
- `Unit`
- `Occupancy`
- `Lease`
- `MaintenanceRequest`
- `ParkingSlot`
- `ParkingAllocation`
- `Visitor`
- `Broadcast`
- `Notification`

### Computed summary metrics

- Totals and rates are computed in the service, not stored.
- Occupancy rate is rounded to 2 decimals and derived from:
  - occupied units / total units.

### Trends

- Trend series are aligned to a date-key (`YYYY-MM-DD`) using UTC `toISOString`.
- Maintenance trend counts created + completed; canceled is not included.
- Broadcast trends include daily recipient counts.

## Edge Cases And Important Scenarios

### Org and user validation

- Missing `user.sub` yields `401 Unauthorized` even if org scope exists.
- Cross-org access returns not found or empty counts, depending on query.

### No buildings

- Overview short-circuits to zeroed summary and empty trends.
- Activity still queries recent activity by org; can return items even without buildings.

### Activity sequencing

- Each source can add multiple events per record.
- `occurredAt` sorting is global; same timestamp ordering is undefined.

### Maintenance activity

- Completed and canceled events are only emitted if timestamps fall inside the activity window.
- A single request can generate multiple activity items.

### Parking allocation activity

- One allocation yields a `parking.allocated` event.
- If ended inside window, a second `parking.ended` event is added.

### Timezone interpretation

- Trends use `toISOString` and are effectively UTC-based.
- If orgs expect local-day trends, this may drift for non-UTC time zones.

## Strengths

- Clear org-scoped read model with consistent permission gating.
- Fast aggregation by using groupBy/count rather than raw joins.
- Activity feed is transparent and easy to expand.
- Test coverage validates ordering and trend aggregation logic.

## Risks And Design Weaknesses

### 1. UTC-based trend slicing

- The trend date keys are UTC-based, which can misalign with org-local days.
- A building in UTC+X may see today’s counts appear under yesterday or tomorrow.

### 2. Activity has no pagination

- `nextCursor` is always null; large orgs can only fetch the last N items.
- Increasing the limit increases load quickly because multiple sources are merged.

### 3. Activity re-derives history from primary tables

- The feed is computed from live tables, not a dedicated event log.
- Updates to source records (e.g., status change) can change what appears in activity.

### 4. Occupancy and lease counts assume single-source truth

- Occupancy rate uses active occupancy count, not lease count.
- It assumes occupancy and lease consistency is maintained elsewhere.

## Improvement Opportunities

### High priority

- Decide whether trends should be org-local time (per building timezone) rather than UTC.
- Decide whether to add pagination for activity or cap it more aggressively.

### Medium priority

- Consider pre-aggregated views or caches for overview if this endpoint becomes hot.
- Add explicit SLA for activity freshness vs query cost.

### Lower priority

- Add a dedicated activity-event table if history needs to be immutable.
- Expose filters on activity type or building to reduce payload size.

## Concrete Review Questions For Your Lead

1. Do we want UTC-based trends, or should trends align to the org’s timezone?
2. Should activity be paginated or filtered (type/building), and what’s the expected max payload?
3. Is it acceptable that activity is derived from live tables instead of an immutable event log?
4. Do we need caching or scheduled aggregation for overview as usage scales?
5. Should maintenance “canceled” events appear in trend counts, not just activity?

## Testing Signals

### Unit/integration coverage already present

- `src/modules/dashboard/dashboard.service.spec.ts`

### Notable cases already tested

- overview summary totals and occupancy rate
- trend aggregation for maintenance and broadcasts
- activity feed ordering across domains
