Here’s a copy-paste prompt you can give a **backend Codex agent** to implement the minimal changes to make the current system behave like the desired “create tenant + move-in” flow, *without redesigning endpoints*. It’s written to force concrete code edits, transactions, locking, and error mapping.

---

## Prompt for Backend Codex Agent

You are working in a Node/TypeScript backend (NestJS-style controllers/services) using Prisma + Postgres. We have multiple entry points that create Occupancy, but the canonical “real move-in” is:

`POST /org/buildings/:buildingId/leases/move-in`
implemented in `lease-lifecycle.controller.ts` + `lease-lifecycle.service.ts` (`LeaseLifecycleService.moveIn`)

### Current problems to fix in backend (must implement)

1. **No unit lock in move-in** (spec expects it; `/org/users/provision` uses `SELECT ... FOR UPDATE` but move-in does not)
2. **Resident role not assigned in move-in**

   * `/org/buildings/:buildingId/residents` assigns resident org role
   * move-in and users/provision do not reliably assign resident role
   * Result: tenants created via move-in can lack resident role
3. Improve domain errors for uniqueness constraint conflicts:

   * `uniq_active_occupancy_per_unit`
   * `uniq_active_occupancy_per_resident`
   * `occupancy_status_endat_consistency`
   * Provide clean API errors (HTTP status + message) instead of raw DB constraint errors

### Desired behavior (canonical)

For `POST /org/buildings/:buildingId/leases/move-in`:

* Must run in a **single DB transaction**
* Must **lock the unit row** (or equivalent) before checking/creating occupancy+lease
* Must ensure resident user has resident org role (key `"resident"` if exists in org) — auto-assign if missing
* Must create occupancy + lease atomically; if anything fails, no partial side effects remain
* Must return clear errors when:

  * unit already has an active occupancy
  * resident already has an active occupancy
  * lease already exists for occupancy (should not happen but handle)

### Repo hints / related code

* Move-in code: `lease-lifecycle.service.ts`
* Constraints mapping: `occupancy-constraints.ts` (DB constraint names)
* Provision flow has lock: `org-users-provision.service.ts` (copy lock pattern)
* Prisma schema: `schema.prisma` (Occupancy, Lease, Role relations)

### Implementation requirements

1. Add locking:

   * Use Prisma `$transaction` and a raw query to lock unit:

     * `SELECT id FROM "Unit" WHERE id = $1 FOR UPDATE`
   * Ensure lock occurs **after validating org/building/unit ownership** and inside same transaction as create operations

2. Ensure resident role assignment:

   * If org has a role with key `"resident"` (or equivalent existing key used elsewhere), ensure the resident user has it.
   * If user is created in move-in (residentUserId not provided), assign role right after create.
   * If residentUserId is provided, check if role missing; assign if missing.
   * Do not fail if role doesn’t exist; just skip assignment.

3. Friendly error mapping:

   * Catch Prisma unique constraint errors / raw DB errors and map by constraint name to:

     * 409 Conflict:

       * `"Unit already has an active occupancy"`
       * `"Resident already has an active occupancy"`
   * Include helpful context in message if you can (unitId, residentUserId)
   * Preserve existing error handling patterns in the codebase (use existing exception types / filters)

4. Keep endpoint contract the same:

   * Same DTO request/response shape as currently
   * No new endpoints
   * No frontend changes required

### Deliverables

* Provide a patch (code changes) for:

  * `lease-lifecycle.service.ts` (core logic)
  * any supporting role assignment helper used by `/residents` flow (reuse if exists)
  * error mapping layer if needed (exception filter or service-level try/catch)
* Add/adjust unit tests (if test framework exists) for:

  * concurrent move-in race prevention (at least simulate by calling twice and expecting 409)
  * move-in assigns resident role for both new and existing residents
  * conflict errors map correctly to 409 with correct message

### Output format

* List changed files
* Show relevant code snippets/diffs
* Explain any assumptions you made about schema or role tables

Do not redesign the system—just make `/leases/move-in` safe + canonical by adding lock + role assignment + better errors.

---
