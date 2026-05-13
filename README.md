# Towerdesk Backend

Towerdesk Backend is a NestJS API for multi-tenant property operations. It models organizations, buildings, units, residents, leases, owners, service providers, maintenance requests, notifications, messaging, visitors, parking, and role-based access control.

This repository is not just a starter scaffold. It contains a broad backend implementation with Prisma migrations, a sizeable test suite, Swagger decorators, Socket.IO realtime notifications, optional BullMQ workers, and S3-compatible storage hooks. It is also not publication-ready as-is; see [Current Status](#current-status) and [Known Limitations](#known-limitations).

## Demo Or Screenshots

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
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/towerdesk
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

This repository is useful as a portfolio backend and internal implementation reference. It now installs, builds, lints, and passes the committed test suite in this workspace, but it should not be presented as production-ready open source until the remaining dependency audit and history-cleanup items are handled.

Latest audit results from this workspace:

- `npm.cmd ci` passed in the latest audit run.
- `npm.cmd run build` passed in the latest audit run.
- `npm.cmd run lint` passed.
- `npm.cmd test -- --runInBand` passed: 78 test suites and 541 tests.
- `npm.cmd audit fix` reduced the dependency audit from 64 vulnerabilities, including 2 critical, to 25 vulnerabilities with no critical findings.
- `npm.cmd audit --audit-level=moderate` still fails with 25 vulnerabilities: 4 low, 15 moderate, and 6 high.

The current tree has been cleaned of local assistant settings, a local schema dump, hardcoded private-looking local paths, and a hardcoded production API origin. If this repository is made public with existing git history, history should still be reviewed or rewritten because older commits contained local artifacts.

## Known Limitations

- `package.json` intentionally keeps `"private": true` so this application is not accidentally published to npm.
- `package.json` still says `"license": "UNLICENSED"` because no open-source license decision has been made.
- There is no committed `LICENSE` file.
- Dependency audit still reports high and moderate vulnerabilities. Remaining fixes require dependency upgrade work, including NestJS-related packages, Swagger, the Nest CLI toolchain, and transitive packages such as `multer`, `lodash`, `glob`, and `webpack`.
- Historical git commits contained root-level artifacts such as a local schema dump, PDF/CSV artifacts, and local assistant settings. The current tree removes the local settings file and schema dump, but public release may still require history rewriting if those artifacts are sensitive.
- A local `.env` file exists in this workspace. It is ignored by `.gitignore`, but secrets should still be rotated if there is any chance they were shared outside the machine.
- Seed data contains demo/default credentials. That is acceptable for local development only if clearly documented and never used in production.
- REST CORS is currently permissive in `src/main.ts` with `origin: true`; production deployments should tighten this.
- The app has a liveness-style health endpoint but no separate readiness endpoint that checks database, queue, storage, or delivery dependencies.
- Queue, email, push, and storage features are partly optional and configuration-dependent. Some paths fall back to noop behavior or raise `NotImplementedException` when storage is not configured.
- Several docs describe migration-era compatibility routes and transitional ownership/role models. Public readers will need a clearer versioning story.

## Lessons Learned

- Multi-tenant backends need explicit scoping rules everywhere; this codebase correctly treats org and building scope as core concerns rather than controller-level afterthoughts.
- Permission systems become hard to reason about when role templates, direct overrides, building assignments, owner grants, provider grants, and resident access all coexist. The implementation has breadth, but the public docs should explain the access model before endpoint details.
- Workflow-heavy domains such as leases and maintenance requests need state-transition tests and clear domain language. Some of that exists here, but the hardening docs correctly identify remaining drift risk.
- Async delivery should be observable. Email, push, broadcast, and invite flows need durable queueing and support-visible failure states before this is easy to operate.
- A repository can compile and still not be publish-ready. Passing build, passing lint, passing tests, dependency health, clean docs, sanitized artifacts, and a clear license are separate gates.

## License

No open-source license is currently provided. The package is marked `UNLICENSED`, so all rights are reserved unless the owner adds a license file and updates `package.json`.
