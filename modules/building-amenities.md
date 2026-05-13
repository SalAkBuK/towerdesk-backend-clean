# Building Amenities Review

## Scope

- Source: `src/modules/building-amenities`
- Public routes:
  - `GET /org/buildings/:buildingId/amenities`
  - `POST /org/buildings/:buildingId/amenities`
  - `PATCH /org/buildings/:buildingId/amenities/:amenityId`
- Core responsibility: manage the building-level amenity catalog consumed by units.

## Main Workflows

1. Management defines amenities at the building level.
2. Units can inherit default amenities when `amenityIds` are omitted.
3. Updates to the amenity catalog change what future unit workflows can reference.

## Important Edge Cases And Scenarios

- Default amenities are auto-applied only when the unit payload omits `amenityIds`.
- `amenityIds: []` means "assign none", not "use defaults".
- Amenity names are effectively building-local business keys, so duplicate-name handling matters.
- Inactive amenities can create ambiguity if older units still reference them.

## Review Focus

- This is a small module, but its behavior affects unit create/import flows in a subtle way.
- Default-assignment semantics should stay explicit because they are easy to misunderstand in frontends and imports.

## Improvement Opportunities

- Add delete/archive semantics with clear impact on linked units.
- Add bulk management for default flags and ordering.
- Surface where an amenity is still in use before allowing destructive changes.

## Testing Signals

- Main integration behavior is covered in `test/amenities.e2e.spec.ts`.
