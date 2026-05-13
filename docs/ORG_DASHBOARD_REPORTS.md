# Org Dashboards and Reports

## Goal
Provide org-admins with a clear operational view of their organization without exposing cross-org data or raw infrastructure logs.

## Scope
- All data is org-scoped by `orgId`.
- Building-level filters are optional where the report is naturally building-specific.
- Reports are read-only.
- Operational request logs stay internal; org users should see audit/activity records, not backend request traces.

## Dashboard V1

The first dashboard should answer these questions quickly:
- How big is the org?
- Are units occupied or vacant?
- What needs attention right now?
- Are maintenance, visitor, and parking operations healthy?
- What changed recently?

### Top-level KPI cards
- Buildings
- Total units
- Occupied units
- Vacant units
- Occupancy rate
- Active leases
- Open maintenance requests
- Overdue maintenance requests
- Visitors today
- Active parking allocations
- Broadcasts sent in the last 30 days
- Unread notifications

### Trend widgets
- Occupancy rate by month
- Maintenance requests created vs resolved by day/week
- Visitor volume by day/week
- Parking utilization by day/week
- Broadcast count and recipient reach by month

### Operational queues
- Overdue maintenance requests
- Leases expiring soon
- Buildings with highest vacancy
- Buildings with highest request volume
- Recent role and permission changes
- Recent org activity

## Report Catalog V1

### 1. Occupancy and lease report
Answers:
- How many units are occupied, vacant, or blocked?
- Which leases are expiring soon?
- Which buildings have the highest churn?

Suggested fields:
- buildingId, buildingName
- unitId, unitLabel
- occupancyStatus
- leaseStatus
- leaseStartDate
- leaseEndDate
- daysUntilExpiry
- residentUserId, residentName

Filters:
- buildingId
- occupancyStatus
- leaseStatus
- expiringWithinDays
- date range

### 2. Maintenance operations report
Answers:
- How many requests are open, in progress, completed, or canceled?
- Which buildings or request types are causing the most load?
- Are requests overdue?

Suggested fields:
- requestId
- buildingId, buildingName
- unitId, unitLabel
- status
- type
- priority
- createdAt
- assignedAt
- completedAt
- ageInHours
- overdue

Filters:
- buildingId
- status
- type
- priority
- assignedToUserId
- date range
- overdueOnly

### 3. Visitor activity report
Answers:
- How many visitors were registered and processed?
- Which buildings see the most visitor traffic?
- What visitor types are most common?

Suggested fields:
- visitorId
- buildingId, buildingName
- unitId, unitLabel
- visitorName
- type
- status
- expectedArrivalAt
- createdAt

Filters:
- buildingId
- unitId
- type
- status
- date range

### 4. Parking utilization report
Answers:
- How many slots exist and how many are allocated?
- Which slot types are under pressure?
- What allocations are ending soon?

Suggested fields:
- slotId
- buildingId, buildingName
- code
- type
- isCovered
- isActive
- allocationCount
- occupied
- available
- utilizationRate

Filters:
- buildingId
- slotType
- isActive
- date range

### 5. Broadcast reach report
Answers:
- What was sent?
- How many recipients were targeted?
- Which buildings were included?

Suggested fields:
- broadcastId
- title
- senderUserId, senderName
- buildingIds
- recipientCount
- createdAt

Filters:
- buildingId
- senderUserId
- date range

### 6. Access-control audit report
Answers:
- Who created or edited roles?
- Who changed permissions?
- What was changed?

Suggested fields:
- eventId
- actorUserId, actorName
- action
- entityType
- entityId
- before
- after
- createdAt

Filters:
- action
- entityType
- actorUserId
- date range

### 7. Org activity feed
Answers:
- What happened recently across the org?

Suggested events:
- role created, updated, deleted
- permission changed
- user role assignment changed
- maintenance request created or completed
- visitor created or updated
- parking allocation created or ended
- broadcast created

## Suggested Endpoints

These are a clean v1 shape if we decide to ship the UI and API together:

- `GET /org/dashboard/overview`
- `GET /org/dashboard/activity`
- `GET /org/reports/occupancy`
- `GET /org/reports/maintenance`
- `GET /org/reports/visitors`
- `GET /org/reports/parking`
- `GET /org/reports/broadcasts`
- `GET /org/reports/access-control`
- `GET /org/reports/activity`

Common query params:
- `buildingId`
- `from`
- `to`
- `status`
- `type`
- `priority`
- `limit`
- `cursor`
- `export=csv`

## Suggested Permission Gates

- `dashboard.read`
- `reports.read`
- `audit.read`
- `analytics.read`

For org-admins, these can be granted by default or mapped through the existing RBAC seed data.

## Data Strategy

For v1:
- Use live Prisma queries for counts and detail lists.
- Use grouping/aggregation in the service layer.
- Avoid a separate warehouse or reporting DB until the usage pattern justifies it.

For v2:
- Add daily rollups for high-volume charts.
- Add export jobs for large reports.
- Add audit tables if we want durable activity history beyond what can be reconstructed from primary entities.
