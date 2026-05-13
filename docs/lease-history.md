# Lease Audit + Timeline Plan

## Direction
- Keep `lease_history` for field-level lease diffs.
- Keep `lease_activity` for non-field lease events.
- Use one frontend history experience powered by timeline endpoints.

## Current Status
- Done: `GET /api/org/residents/:userId/leases`
- Done: `GET /api/org/residents/:userId/leases/timeline` (history stream)
- Done: `GET /api/org/leases/:leaseId/timeline` (history + activity)
- Done: activity writes for:
  - documents add/delete
  - access cards issued/status changed/deleted
  - parking stickers issued/status changed/deleted
  - occupants replaced
  - move-in / move-out
  - parking allocated in move-in flow

## Remaining Decisions (Product/Compliance)
- Retention policy: forever vs archive window.
- Visibility rules: `leases.read` only vs stricter scope.
- Data sensitivity: payload redaction strategy for timeline items.
- v1 scope lock: confirm which activity events are mandatory in UI.

## Suggested Rollout
1. Phase 1 (done): resident leases endpoint + pagination + tests.
2. Phase 2 (implemented): lease activity model + existing flow writes + unified lease timeline endpoint.
3. Phase 3: frontend history tab consumes timeline endpoints as single source.
4. Phase 4: analytics/reporting and alerts (expiry reminders, churn insights).


