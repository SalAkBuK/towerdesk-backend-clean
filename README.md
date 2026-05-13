# Towerdesk Backend

Towerdesk Backend is a NestJS API for multi-tenant property operations. It models organizations, buildings, units, residents, leases, owners, service providers, maintenance requests, notifications, messaging, visitors, parking, and role-based access control.

This repository is a portfolio-friendly reference implementation with Prisma migrations, a sizeable test suite, Swagger decorators, Socket.IO realtime notifications, optional BullMQ workers, and S3-compatible storage hooks. It should be reviewed before production use; see [Current Status](#current-status) and [Known Limitations](#known-limitations).

## Demo or Screenshots

No public demo URL or screenshots are included yet.

Suggested placeholder before publishing:

- API demo URL: `TBD`
- Swagger screenshot: `TBD`
- Example frontend/mobile screen using this API: `TBD`

## Features

- JWT authentication with access and refresh tokens.
- Password change, forgot-password, reset-password, and invite-style onboarding support.
- Multi-tenant organization scoping through `orgId`.
- Platform-level organization and organization-admin bootstrap endpoints.
- Role templates, scoped access assignments, permission overrides, and permission guards.
- Building-level access rules for staff, managers, building admins, residents, owners, and providers.
- Organization property setup: buildings, building amenities, unit types, units, and unit CSV import.
- Resident onboarding, resident profiles, resident self-service, directories, and occupancies.
- Lease and contract workflows, including documents, occupants, access cards, parking stickers, move-in, move-out, history, and activity timelines.
- Owner registry, party identity resolution, ownership history, owner access grants, and owner-portal views.
- Service provider registry, provider access grants, and provider request surfaces.
- Maintenance request workflows for residents, building operations, providers, owner approvals, estimates, comments, and attachments.
- Stored notifications plus Socket.IO realtime notifications on namespace `/notifications`.
- Push-device registration and Expo push delivery hooks.
- Messaging conversations across management, residents, and owners.
- Broadcast fan-out into notifications.
- Visitor and parking management.
- Dashboard overview and activity endpoints.
- Health endpoint.

## Tech Stack

- Runtime: Node.js 18+ recommended.
- Framework: NestJS 10, TypeScript.
- Database: PostgreSQL.
- ORM: Prisma 5.
- Auth: Passport JWT, `@nestjs/jwt`, Argon2.
- Validation: `class-validator`, `class-transformer`, Zod for env validation.
- Realtime: Socket.IO through `@nestjs/websockets` and `@nestjs/platform-socket.io`.
- Jobs: BullMQ and Redis through `ioredis` when queueing is enabled.
- Storage: AWS SDK S3-compatible adapter.
- Email: Nodemailer SMTP adapter plus noop fallback.
- Logging and middleware: Pino/NestJS Pino, Helmet, compression.
- API docs: `@nestjs/swagger` and Swagger UI.
- Testing: Jest and ts-jest.
- Tooling: ESLint and Prettier.

## Getting Started

### Prerequisites

- Node.js 18 or newer.
- PostgreSQL.
- Optional Redis if `QUEUE_ENABLED=true`.
- Optional S3-compatible storage if file upload/download features are enabled.

### Install

```bash
npm ci
```

On Windows PowerShell, execution policy may block `npm.ps1`. Use:

```powershell
npm.cmd ci
```

### Configure Environment

Copy the safe example file and then replace local placeholder values:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

The full variable list is documented in `.env.example`. Minimum local variables:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/towerdesk
JWT_ACCESS_SECRET=replace-me-local-access-secret
JWT_REFRESH_SECRET=replace-me-local-refresh-secret
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=604800
PLATFORM_API_KEY=replace-me-local-platform-key
```

Common optional variables:

```env
WS_CORS_ORIGINS=http://localhost:3000,http://localhost:3001
WS_LOG_CONNECTIONS=true
QUEUE_ENABLED=false
QUEUE_HOST=localhost
QUEUE_PORT=6379
EMAIL_PROVIDER=noop
PUSH_PROVIDER=noop
SWAGGER_ENABLED=true
```

Production deployments must use real secrets and should explicitly set CORS, email, queue, storage, push, timeout, and observability-related values.

### Database

Generate Prisma Client:

```bash
npm run prisma:generate
```

Apply migrations in local development:

```bash
npm run prisma:migrate
```

Seed baseline roles, permissions, demo org data, and platform/admin users:

```bash
npm run prisma:seed
```

Be careful with seed defaults. The seed file contains local/demo credentials such as `Admin123!` unless overridden by environment variables.

### Run

Development API:

```bash
npm run dev
```

Production-style API after build:

```bash
npm run build
npm run start:api
```

Worker process after build:

```bash
npm run start:worker
```

The API uses a global `/api` prefix for controllers. Health is exposed at:

```text
GET /api/health
```

Swagger is configured in `src/main.ts` at `docs` when `SWAGGER_ENABLED=true`.

## Available Scripts

- `npm run dev` - start the NestJS API in watch mode.
- `npm run build` - generate Prisma Client and build TypeScript into `dist/`.
- `npm run start` - start `dist/main.js`.
- `npm run start:api` - start the built API process.
- `npm run start:worker` - start the built worker process.
- `npm run start:prod` - alias for starting `dist/main.js`.
- `npm run prisma:generate` - generate Prisma Client.
- `npm run prisma:migrate` - run `prisma migrate dev`.
- `npm run prisma:migrate:deploy` - apply existing migrations in deployed environments.
- `npm run prisma:seed` - seed baseline permissions, roles, and demo/admin records.
- `npm run prisma:studio` - open Prisma Studio.
- `npm run render-start` - run migrations and start the built API.
- `npm run render-start:worker` - run migrations and start the built worker.
- `npm run loadtest` - run a basic autocannon load test.
- `npm run ws:smoke` - run the Socket.IO notification smoke script.
- `npm run lint` - run ESLint with Prettier checks.
- `npm test` - run Jest tests.

## Project Structure

```text
src/
  main.ts                         API bootstrap, middleware, Swagger, global prefix
  worker.ts                       worker bootstrap
  app.module.ts                   API module composition
  worker.module.ts                worker module composition
  common/                         guards, decorators, filters, interceptors, utilities
  config/                         environment schema and parsed env object
  infra/                          Prisma, queue, storage, email, logger, metrics
  modules/                        feature modules
prisma/
  schema.prisma                   database schema
  migrations/                     SQL migration history
  seed.ts                         seed data for roles, permissions, demo/admin users
test/                             Jest integration/e2e tests
scripts/                          load test and realtime smoke scripts
docs/                             API, deployment, frontend, mobile, and architecture notes
modules/                          module-level review documents
Instructions/                     internal planning and implementation notes
```

Major feature modules under `src/modules/`:

- `auth`
- `access-control`
- `users`
- `platform`
- `buildings`
- `building-assignments`
- `building-amenities`
- `unit-types`
- `units`
- `unit-ownerships`
- `occupancies`
- `residents`
- `leases`
- `owners`
- `owner-portfolio`
- `parties`
- `service-providers`
- `maintenance-requests`
- `notifications`
- `broadcasts`
- `messaging`
- `parking`
- `visitors`
- `dashboard`
- `org-profile`
- `health`

## Architecture Overview

The backend follows a conventional NestJS module layout:

- Controllers expose REST routes and apply guards/decorators.
- Services hold workflow and business logic.
- Repositories wrap Prisma access for most feature modules.
- DTOs define request validation and response mapping.
- Guards enforce JWT auth, org scope, platform scope, permissions, owner scope, provider access, and building access.
- `src/infra/*` contains shared integrations for Prisma, logging, metrics, queueing, email, and S3-compatible storage.
- Realtime notifications are stored in Postgres and emitted through Socket.IO.
- Worker bootstrapping is separate from API bootstrapping so delivery tasks can run outside the HTTP process.

The core boundary is tenant isolation. Most business data belongs to an `Org`, and org/building/user scope is resolved before service logic mutates or returns records.

## Realtime Notifications

- Socket.IO namespace: `/notifications`.
- Default Socket.IO path: `/socket.io`.
- Auth can be supplied by bearer header, `auth: { token }`, or `?token=`.
- Main events include `notifications:hello`, `notifications:new`, `notifications:read`, `notifications:read_all`, `notifications:dismiss`, and `notifications:undismiss`.
- `WS_CORS_ORIGINS` controls websocket CORS. In production, an empty value denies all origins.
- More detail is in `docs/NOTIFICATIONS_REALTIME.md`.

## Current Status
This is a portfolio/open-source backend project. It installs, builds, lints, and runs its committed tests in this workspace. Review and harden it before any production deployment.

## Known Limitations

- Dependency audit may still report moderate issues in transitive packages. A production deployment should include dependency upgrade work and a security review.
- Seed data contains demo/default credentials. Use only for local development and rotate before any deployment.
- REST CORS is permissive in `src/main.ts` with `origin: true`; production deployments should tighten this.
- The app exposes a liveness-style health endpoint but no dedicated readiness check for external dependencies.
- Queue, email, push, and storage integrations are optional and configuration-dependent. Some paths are intentionally noop until configured.
- Several docs include migration-era or compatibility notes. Public readers should verify which flows match the current product scope.

## Lessons Learned

- Multi-tenant backends need explicit scoping rules everywhere; this codebase correctly treats org and building scope as core concerns rather than controller-level afterthoughts.
- Permission systems become hard to reason about when role templates, direct overrides, building assignments, owner grants, provider grants, and resident access all coexist. The implementation has breadth, but the public docs should explain the access model before endpoint details.
- Workflow-heavy domains such as leases and maintenance requests need state-transition tests and clear domain language. Some of that exists here, but the hardening docs correctly identify remaining drift risk.
- Async delivery should be observable. Email, push, broadcast, and invite flows need durable queueing and support-visible failure states before this is easy to operate.
- A repository can compile and still not be publish-ready. Passing build, passing lint, passing tests, dependency health, clean docs, sanitized artifacts, and a clear license are separate gates.

## License

Licensed under the MIT License. See [LICENSE](LICENSE).
