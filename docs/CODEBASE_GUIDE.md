# Towerdesk Backend: How the Codebase Works (Beginner Friendly)

This guide explains the backend in plain language and points you to the files that matter.
If you are new to backend work, read it top to bottom once, then jump to the sections you need.

## 1) Big picture

This is a NestJS + TypeScript API backed by PostgreSQL and Prisma.
Think of it as layers:

- HTTP request comes in.
- NestJS routes it to a controller method.
- The controller hands off to a service (business logic).
- The service talks to the database through a repo (Prisma).
- Response is shaped and sent back.

The codebase is split into modules (Auth, Buildings, Requests, etc), each with its own
controller/service/repo/DTOs.

## 2) Project layout (what lives where)

- `src/main.ts` boots the app, sets middleware, and wires up global filters/guards.
- `src/app.module.ts` is the main module that imports everything else.
- `src/modules/*` contains business features (auth, users, buildings, requests, etc).
- `src/common/*` contains shared guards, decorators, filters, interceptors, and utils.
- `src/infra/*` contains infrastructure helpers (Prisma, logger, metrics, queue, storage).
- `prisma/schema.prisma` defines the database tables and relationships.
- `prisma/migrations/*` are the SQL migrations that update the DB.
- `docs/API.md` is a frontend-focused API reference.
- `test/*` contains e2e tests for key flows.

## 3) The request lifecycle (step by step)

Use this flow when you are trying to debug "what happens when I call an endpoint":

1) **Server startup** (`src/main.ts`)
   - Adds security headers with `helmet`.
   - Enables compression.
   - Sets JSON body limits from env (`HTTP_BODY_LIMIT`).
   - Enables CORS for all origins.
   - Sets global prefix `api` (so routes are `/api/...`).
   - Adds global validation pipe, exception filter, and logging/metrics interceptors.
   - Swagger docs are served at `/docs`.

2) **Request enters NestJS**
   - Global interceptors run:
     - `LoggingInterceptor` adds a request id and logs timing.
     - `RequestMetricsInterceptor` measures and samples latency.
   - Global validation pipe rejects invalid DTOs (class-validator).
   - Global exception filter shapes errors into a consistent JSON response.

3) **Guards enforce access**
   - `JwtAuthGuard` checks the JWT access token.
   - `OrgScopeGuard` ensures the user has `orgId` in their token.
   - `PermissionsGuard` checks required permissions from `@RequirePermissions`.
   - `BuildingAccessGuard` applies building-level rules (assignments vs permissions).
   - `PlatformAuthGuard` handles platform endpoints (platform key or superadmin JWT).

4) **Controller → Service → Repo**
   - Controller reads DTOs and user info (`@CurrentUser`).
   - Service does business logic and orchestration.
   - Repo runs Prisma queries against Postgres.

5) **Response**
   - DTO mappers shape what the API returns.
   - Errors are returned as `{ success: false, error: { code, message, ... } }`.

## 4) Authentication and authorization (simple view)

### JWT auth (access + refresh)
- Login and register are in `src/modules/auth/*`.
- Access tokens include `sub`, `email`, and `orgId` (see `auth.service.ts`).
- Refresh tokens are validated with `RefreshTokenGuard` and stored hashed in DB.
- Passwords and refresh tokens are hashed with Argon2.

### Roles and permissions
- Permissions are permission strings like `buildings.read`.
- Roles group permissions and are stored in DB (`Role`, `Permission`, `RolePermission`).
- `AccessControlService` builds the effective permission set by:
  - starting from role permissions, then
  - applying user-specific overrides (allow/deny).
- `@RequirePermissions(...)` + `PermissionsGuard` enforce them.

### Org scope
- Many routes are `/org/*` and require `orgId` in the JWT.
- `OrgScopeGuard` and `assertOrgScope` enforce that.

### Building scope
- Building routes check:
  - global permission, OR
  - assignment type (BUILDING_ADMIN / MANAGER / STAFF), OR
  - resident access for certain read routes.
- This is implemented in `BuildingAccessGuard` and `BuildingAccessService`.

### Platform access
- Platform endpoints (like create orgs) are in `src/modules/platform/*`.
- Access uses:
  - `x-platform-key` header, or
  - a platform superadmin JWT with permissions.

## 5) Database model (what the tables mean)

Prisma models in `prisma/schema.prisma` represent the core data:

- `Org` is the tenant (company).
- `User` belongs to an org (or is a platform user).
- `Building` belongs to an org.
- `Unit` belongs to a building.
- `BuildingAssignment` attaches a user to a building with a role.
- `Occupancy` represents a resident living in a unit (ACTIVE or ENDED).
- `MaintenanceRequest` is a ticket created by a resident, assigned to staff.
- `Notification` records events like request status changes.
- `Role`, `Permission`, `UserRole`, `UserPermission` implement RBAC.

Use this mental model:
Org → Buildings → Units → Occupancies
Users can be admins/managers/staff; residents are users tied to occupancies.

## 6) Module tour (what each feature does)

### Auth (`src/modules/auth/*`)
- Register, login, refresh, change-password.
- Issues JWTs and stores refresh token hash.

### Users + Org users (`src/modules/users/*`)
- `UsersController` handles `/users/*` (me, profile, create org user).
- `OrgUsersController` handles `/org/users` list.
- `OrgUsersProvisionService` can create or link a user, apply roles,
  building assignments, and residency in one transaction.

### Access control (`src/modules/access-control/*`)
- Manage roles, permissions, and user overrides.
- `AccessControlService` computes effective permissions.

### Platform (`src/modules/platform/*`)
- Create orgs and org admins.
- Protected by platform auth guard.

### Buildings / Units / Assignments / Occupancies
- `buildings`: create/list buildings inside an org.
- `units`: create/list units per building, with availability filters.
- `building-assignments`: staff/manager/admin assignment per building.
- `occupancies`: residents in units, used for availability and resident access.

### Residents (`src/modules/residents/*`)
- Onboard a resident (creates user + ACTIVE occupancy).
- Fetch resident profile and current occupancy.

### Maintenance requests (`src/modules/maintenance-requests/*`)
Two controllers:
- Resident endpoints (`/resident/requests`) create and manage own requests.
- Building ops endpoints (`/org/buildings/:buildingId/requests`) for staff/managers.
Status flow is enforced (OPEN → ASSIGNED → IN_PROGRESS → COMPLETED).

### Notifications (`src/modules/notifications/*`)
- Stores notification events in DB.
- Emitted during maintenance request changes.

### Org profile (`src/modules/org-profile/*`)
- Read/update org profile (name, logo URL).

### Health (`src/modules/health/*`)
- Simple `/health` endpoint.

## 7) Infrastructure and shared utilities

- Prisma client: `src/infra/prisma/prisma.service.ts`
- Logger: `src/infra/logger/logger.module.ts` (Pino with request ids)
- Metrics: `src/infra/metrics/*` (logs p50/p95/p99 on an interval)
- Queue: `src/infra/queue/*` (BullMQ, off by default)
- Storage: `src/infra/storage/*` (S3 adapter, requires env config)
- Common helpers: guards, decorators, interceptors, filters, pipes in `src/common/*`

## 8) How to add a new endpoint (practical workflow)

1) Decide the module (or create a new one).
2) Add a DTO for input validation (class-validator).
3) Add a controller method and attach guards/decorators.
4) Implement business logic in the service.
5) Add Prisma queries in the repo (or use Prisma directly in service if needed).
6) Add response DTO / mapper if required.
7) Update tests or add a new e2e test.

Example path to follow:
`src/modules/buildings/buildings.controller.ts` →
`src/modules/buildings/buildings.service.ts` →
`src/modules/buildings/buildings.repo.ts`

## 9) Where to look first when debugging

- Routing issue? Check controller and decorators.
- Permissions issue? Check `@RequirePermissions` and `PermissionsGuard`.
- Org/building access issue? Check `OrgScopeGuard` and `BuildingAccessGuard`.
- Data issue? Check Prisma repo query and the schema in `prisma/schema.prisma`.
- Error formatting? Check `src/common/filters/http-exception.filter.ts`.
- Unexpected response shape? Check response DTO mapper (look for `toXResponse`).

## 10) Useful references

- API reference for frontend usage: `docs/API.md`
- Main bootstrap logic: `src/main.ts`
- Main module import list: `src/app.module.ts`
- Database schema: `prisma/schema.prisma`

