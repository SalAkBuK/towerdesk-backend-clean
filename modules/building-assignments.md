# Building Assignments Review

## Scope

- Source: `src/modules/building-assignments`
- Public route: `GET /org/buildings/:buildingId/assignments`
- Core responsibility: expose a compatibility read model for building-scoped access assignments.

## Main Workflows

1. Caller passes building scope checks.
2. Service resolves building-scoped assignments for that building.
3. Response keeps legacy-friendly fields such as assignment `type` while mapping from the newer access model.

## Important Edge Cases And Scenarios

- The route is read-only on purpose; write paths moved to canonical user access-assignment endpoints.
- The response preserves compatibility for older clients that still expect assignment `type`.
- Visibility depends on both building access and `building.assignments.read`.

## Review Focus

- This module exists mostly to reduce migration breakage rather than to own a business domain.
- Compatibility facades are valuable but tend to linger and increase maintenance cost.

## Improvement Opportunities

- Define an explicit deprecation plan for the compatibility route.
- Document the mapping between legacy assignment `type` and role-template-based access.
- Add filters if UI consumers still depend on this route heavily during migration.

## Testing Signals

- `building-assignments.service.spec.ts` checks the legacy compatibility mapping.
- Related building-access integration coverage exists in `test/building-access.e2e.spec.ts`.
