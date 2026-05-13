# Unit Types Review

## Scope

- Source: `src/modules/unit-types`
- Main files:
  - `unit-types.controller.ts`
  - `unit-types.service.ts`
  - `unit-types.repo.ts`
  - `dto/create-unit-type.dto.ts`
  - `dto/unit-type.response.dto.ts`
- Public routes:
  - `GET /org/unit-types`
  - `POST /org/unit-types`
- Core responsibility: maintain the org-local unit-type catalog used by units and unit CSV import.

## What This Module Really Owns

- The catalog of unit-type names for one org.
- Visibility of active unit types only.
- Conflict handling for duplicate type creation.
- A dependency surface consumed by the units module during:
  - manual unit creation
  - unit update
  - CSV import by unit-type name

## Important Architectural Note

This module is intentionally small, but it acts as a reference-data source for `units`.

That means:

- it has a small route surface
- but mistakes here produce friction in broader unit workflows

It is closer to a controlled vocabulary or lookup table than a full workflow module.

## Step-By-Step Request Flows

### 1. List active unit types

1. Controller accepts `GET /org/unit-types`.
2. `JwtAuthGuard`, `OrgScopeGuard`, and `PermissionsGuard` run.
3. Caller must have `unitTypes.read`.
4. Service derives `orgId` from authenticated org scope.
5. Repo loads unit types for that org with `isActive=true`.
6. Results are returned in descending `createdAt` order.

### 2. Create unit type

1. Controller accepts `POST /org/unit-types`.
2. `JwtAuthGuard`, `OrgScopeGuard`, and `PermissionsGuard` run.
3. Caller must have `unitTypes.write`.
4. Service derives `orgId` from authenticated org scope.
5. Repo creates a unit-type row with:
   - `name`
   - `isActive ?? true`
6. Duplicate-key/type conflicts from Prisma are mapped to `409 Conflict` with message `Unit type already exists`.

## Validation And Defaults

### Create DTO rules

- `name`
  - required string
  - minimum length 1
- `isActive`
  - optional boolean

### Default behavior

- omitted `isActive` becomes `true`

## Data Model

### Fields exposed in response

- `id`
- `orgId`
- `name`
- `isActive`
- `createdAt`
- `updatedAt`

### Query behavior

- list endpoint returns only active types
- create writes a simple org-local lookup row

## Dependency Role In Other Modules

### Units module dependency

- `units.create(...)` validates `unitTypeId` in org scope
- `units.update(...)` validates `unitTypeId` in org scope
- `units.importCsv(...)` resolves unit types by lowercase trimmed name

### Practical implication

- if unit-type names are inconsistent, imports and admin data-entry become brittle
- if a type is inactive, list consumers won’t see it, but older units may still reference it historically

## Edge Cases And Important Scenarios

### Org scope edge cases

- Unit types are org-local, not global.
- Cross-org visibility should never occur.

### Active/inactive edge cases

- `GET /org/unit-types` only returns active rows.
- There is currently no update route to deactivate a type through this module, even though the table supports `isActive`.
- That means inactive-state support exists in persistence but is not fully surfaced through the public API.

### Duplicate edge cases

- Duplicate create attempts are translated into `409 Conflict`.
- The current service relies on the DB uniqueness guarantee rather than pre-checking.

### Units-module coupling edge cases

- CSV import resolves by unit-type name, so naming changes have operational consequences.
- If admins create near-duplicate names, the catalog can become confusing quickly.

## Strengths

- Very simple and easy to reason about.
- Proper org scoping.
- Good conflict mapping for duplicate creates.
- Clean fit as a lookup-table module.

## Risks And Design Weaknesses

### 1. API surface is smaller than the data model

- The table supports `isActive`.
- The public API only exposes create and active-list.
- There is no update or deactivate path.

### 2. Reference-data quality depends on naming discipline

- Because unit import resolves by name, inconsistent naming becomes an operational problem.

### 3. No lifecycle management for old types

- If a unit type should stop being used, the backend has no obvious admin route to retire it while preserving history.

## Improvement Opportunities

### High priority

- Add update/deactivate support so orgs can retire or rename unit types safely.
- Define whether names must be unique case-insensitively and document that explicitly if not already enforced in DB.

### Medium priority

- Add sorting/order metadata if frontend dropdown ordering matters.
- Add description/category metadata only if product genuinely needs richer taxonomy.

### Lower priority

- Add usage insights such as "how many units currently reference this type" before allowing deactivation or rename.

## Concrete Review Questions For Your Lead

1. Do you want unit types to be editable/deactivatable, or should they remain append-only?
2. Is name-based CSV resolution good enough, or should imports eventually support explicit type IDs/templates?
3. Do you need guardrails against naming drift like `1BR`, `1 BR`, `One Bedroom`, etc.?

## Testing Signals

### Current coverage

- This module is covered indirectly through `test/org-units.e2e.spec.ts`.

### Notable cases already exercised indirectly

- create and list unit types
- using created unit types in unit create flows
- using unit-type names in unit import flows

## Suggested Follow-On Docs

- A short catalog-governance note for unit-type naming conventions.
