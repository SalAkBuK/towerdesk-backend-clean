# AGENTS GUIDE

Fast orientation for this NestJS + Prisma + Postgres backend with Socket.IO realtime notifications.

## Stack & Layout
- NestJS app in `src/` (REST controllers, guards, interceptors).
- Prisma ORM (`prisma/schema.prisma`, migrations in `prisma/migrations/`).
- Auth: JWT access/refresh; config in `src/config/env.ts`.
- Realtime: Socket.IO namespace `/notifications`, default path `/socket.io`; gateway in `src/modules/notifications/notifications.gateway.ts`.

## Setup (Local)
- Node 18+ recommended. Install deps: `npm install`.
- Copy `.env.example` to `.env`; set `DATABASE_URL`, JWT secrets, etc.
- Prisma: `npm run prisma:generate` and `npm run prisma:migrate` (or `prisma migrate dev`) after DB is reachable.
- Start dev: `npm run dev`.

## Key Env Vars
- `NODE_ENV`, `PORT`, `DATABASE_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`
- `WS_CORS_ORIGINS`: comma-separated Socket.IO allowed origins. In production empty = deny all. In dev/test empty -> `*`.
- `WS_LOG_CONNECTIONS`: enable WS connection logs (default true unless overridden).
- HTTP/timeouts: `HTTP_BODY_LIMIT`, `HTTP_SERVER_TIMEOUT_MS`, etc.
- Optional: `QUEUE_*`, `STORAGE_*`, `PLATFORM_*`

## Notifications (Socket.IO)
- Namespace: `/notifications`; path: `/socket.io`.
- Auth: bearer header, `auth: { token }`, or `?token=`; `orgId` optional only when token lacks orgId.
- Events: `notifications:hello`, `notifications:new`, `notifications:read`, `notifications:read_all`, `notifications:dismiss`, `notifications:undismiss`.
- CORS for WS uses `WS_CORS_ORIGINS` only (REST CORS is separate in `src/main.ts`).
- Proxy: `/socket.io/` must forward with `Upgrade` + `Connection` headers and `proxy_http_version 1.1` (see `docs/NOTIFICATIONS_REALTIME.md`).

## RBAC
- Permissions enforced via `@RequirePermissions` + `PermissionsGuard`.
- Permission keys and role mappings in `prisma/seed.ts`.
  - `org_admin` has `unitTypes.*`, `owners.*`, broad org perms.
  - `admin` role is read-only for unitTypes/owners by default.
  - Manager is a building assignment type, not an org role; no org-scoped write unless granted explicitly.
- Missing perms -> 403 "Missing required permissions".

## Modules (quick map)
- Auth: `src/modules/auth/*`
- Access Control: `src/modules/access-control/*`
- Users: `src/modules/users/*`
- Buildings & Assignments: `src/modules/buildings/*`, `src/modules/building-assignments/*`
- Units & Unit Types: `src/modules/units/*`, `src/modules/unit-types/*`
- Owners: `src/modules/owners/*`
- Residents & Occupancies: `src/modules/residents/*`, `src/modules/occupancies/*`
- Maintenance Requests: `src/modules/maintenance-requests/*`
- Notifications: `src/modules/notifications/*`
- Org Profile: `src/modules/org-profile/*`
- Platform: `src/modules/platform/*`

## Testing
- Jest: `npm test`.
- WS smoke: `npm run ws:smoke` with `WS_SMOKE_TOKEN` (optionally `API_BASE_URL`, `WS_BASE_URL`).
- Realtime/E2E tests: `test/notifications*.spec.ts`.

## Deployment Notes
- Build: `npm run build` -> `dist/main.js`.
- Typical prod via PM2: `pm2 start dist/main.js --name towerdesk-backend`; restart with `pm2 restart <name> --update-env`.
- Ensure `.env` on server. Nginx/ALB must forward `/socket.io/` with upgrade headers; app listens on `PORT`.

## Adding a New Module
- Create `src/modules/<feature>` with controller/service/repo/module; DTOs in `dto/`.
- Wire into `app.module.ts` if global.
- Apply guards (`JwtAuthGuard`, `OrgScopeGuard`, `PermissionsGuard`) and define permission keys; update seeds/role mappings if adding perms.
- Add Prisma schema changes + migration if needed.
- Add tests (unit/e2e) under `test/`.

## Module Scaffolding Checklist
- Files: `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`, `<feature>.repo.ts`, DTOs under `dto/`, constants/enums under `<feature>.constants.ts` if needed.
- Guards: default to `@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)` on org-scoped controllers; add `@RequirePermissions(...)` per endpoint.
- Validation: DTOs with `class-validator` + `class-transformer`; use `ApiProperty`/`ApiOkResponse` for Swagger.
- Responses: map entities to DTOs (avoid leaking internal fields); reuse existing mappers (see `users.dto` patterns).
- Docs: add to `docs/API.md` if you introduce new endpoints/behavior.

## Prisma Workflow
- Update `prisma/schema.prisma`; run `npx prisma generate`.
- Create migration: `npx prisma migrate dev --name <name>` (or `prisma migrate dev`).
- Seed updates: if adding permissions/roles/default data, update `prisma/seed.ts`.
- For DB clients, prefer `PrismaService`; for transactions, accept `DbClient` (union of `PrismaService | Prisma.TransactionClient`).

## Testing Expectations
- Unit/integration with Jest: `npm test`.
- E2E patterns live under `test/`; follow existing module test styles (fixtures + REST calls).
- Realtime: use `test/notifications*.spec.ts` as a template for Socket.IO or add a smoke script under `scripts/` if applicable.
- Keep tests org-scoped and permission-aware; assert 403/404 isolation where relevant.

## RBAC & Scoping Patterns
- Org-scoped data: always enforce `orgId` from `@CurrentUser` (or `assertOrgScope`) and filter queries accordingly.
- Building-scoped flows: use building assignments (MANAGER/STAFF/BUILDING_ADMIN) where applicable; see maintenance requests and building assignments for patterns.
- New permissions: add keys to `prisma/seed.ts`, map to roles, and gate endpoints with `@RequirePermissions`.

## Lint/Format
- Lint: `npm run lint` (ESLint + Prettier). Fix formatting and `no-explicit-any`/unused vars.
- Format rules are enforced by Prettier; keep multiline arrays/objects formatted.
