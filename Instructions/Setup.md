You are Codex. Generate a NestJS + TypeScript backend boilerplate implementing the “Backend architecture best practices” stack we agreed on:

STACK (must match)
- Node.js + TypeScript + NestJS
- PostgreSQL
- Prisma (schema + migrations)
- Auth: JWT access tokens + refresh tokens
- Password hashing: Argon2
- Validation: class-validator + class-transformer
- API docs: @nestjs/swagger
- Logging: pino (nestjs-pino recommended)
- File uploads: S3-compatible storage abstraction (Cloudflare R2 friendly) — placeholders only (do not require real credentials)
- Optional queue scaffold: BullMQ (placeholder only)

GOAL
- Create a repo-ready project scaffold with a clean architecture and conventions so it won’t become spaghetti.
- Nothing product-specific. No business requirements beyond user management + auth scaffolding.

PROJECT STRUCTURE (generate exactly this; add files if needed but don’t remove these)
src/
  main.ts
  app.module.ts

  config/
    env.schema.ts                 # validates env vars (zod or joi OK)
    env.ts                        # typed config loader

  common/
    decorators/
      current-user.decorator.ts
    guards/
      jwt-auth.guard.ts
      permissions.guard.ts        # placeholder, checks metadata/roles
    filters/
      http-exception.filter.ts    # consistent JSON error shape
    interceptors/
      logging.interceptor.ts      # request id + structured logs
    pipes/
      validation.pipe.ts          # wraps Nest ValidationPipe settings
    types/
      request-context.ts

  infra/
    prisma/
      prisma.module.ts
      prisma.service.ts
    logger/
      logger.module.ts            # pino recommended
    storage/
      storage.module.ts
      storage.service.ts          # interface + S3 adapter placeholder
      s3.adapter.ts               # placeholder using AWS SDK, not wired to real bucket yet
    queue/
      queue.module.ts             # BullMQ/Redis scaffold (optional)

  modules/
    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts
      auth.repo.ts
      dto/
        login.dto.ts
        register.dto.ts
        refresh.dto.ts
      strategies/
        jwt.strategy.ts
      guards/
        refresh-token.guard.ts
      constants.ts

    users/
      users.module.ts
      users.controller.ts
      users.service.ts
      users.repo.ts
      dto/
        user.response.dto.ts

REQUIREMENTS / BEHAVIOR
1) App bootstrap
- main.ts: set global prefix “/api”, enable swagger at “/docs”, apply global ValidationPipe via your wrapper, register global exception filter for consistent errors, enable request-id + structured logs.
- app.module.ts: compose config, logger, prisma, auth, users modules. Keep it clean.

2) Config
- env.schema.ts: validate required env vars (NODE_ENV, PORT, DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_TTL, JWT_REFRESH_TTL).
- env.ts: typed config accessors; no direct process.env usage elsewhere.

3) Logging
- Use pino logger (nestjs-pino). Include request id in logs. Provide logging.interceptor.ts that attaches request id (uuid) and logs method/path/status/duration.

4) Error handling
- http-exception.filter.ts: consistent JSON error shape:
  { "success": false, "error": { "code": string, "message": string, "details"?: any }, "requestId": string }
- Ensure validation errors map into that shape.

5) Auth + Users (build this first, robustly)
- Prisma models for User (id uuid, email unique, passwordHash, name optional, role enum default USER, isActive boolean default true, createdAt/updatedAt).
- Use Argon2 for hashing.
- Auth endpoints:
  POST /api/auth/register
  POST /api/auth/login
  POST /api/auth/refresh
- JWT access token: short TTL, includes sub=userId, role, email.
- Refresh token: long TTL; store hashed refresh token in DB (refreshTokenHash) per user; rotate on refresh.
- Guards:
  jwt-auth.guard.ts: validates access JWT
  refresh-token.guard.ts: validates refresh JWT
- current-user.decorator.ts: returns user payload injected by jwt strategy.
- permissions.guard.ts: placeholder that reads metadata like @SetMetadata('permissions', [...]) but currently always passes (or role check stub).
- Users endpoints:
  GET /api/users/me (protected) returns user.response.dto.ts (no passwordHash)
  GET /api/users/:id (protected; basic)
- Swagger decorators: tag controllers, document auth, DTOs, responses.

6) Prisma integration
- infra/prisma.service.ts extends PrismaClient and hooks enableShutdownHooks.
- Provide prisma schema + migration instructions in README (create minimal README).
- Include npm scripts: dev, build, start, prisma:generate, prisma:migrate, prisma:studio, lint, test.

7) Storage + Queue placeholders
- storage.service.ts defines interface methods (putObject/getSignedUrl/deleteObject).
- s3.adapter.ts uses AWS SDK v3 signatures but does NOT require real env vars to compile; throw “NotImplemented” by default.
- queue.module.ts sets up BullMQ skeleton but can be disabled by config.

QUALITY BAR
- Use Nest best practices: modules/controllers/services/providers; DI everywhere.
- Use DTO validation properly.
- Keep controllers thin; move logic to services; DB access in repo.
- TypeScript strict, eslint + prettier setup.
- Tests: at least one unit test for AuthService (register/login/refresh happy path can use mocked repo and argon2).
- Do not invent business requirements, no buildings/maintenance/etc.

OUTPUT
- Generate all required files with correct content.
- Include package.json, tsconfig, eslint/prettier config, prisma/schema.prisma, and a README with setup steps.
- Ensure it installs and runs with `npm install` then `npm run dev` after setting env vars.

Important: Focus on the boilerplate architecture. Keep code clean, idiomatic, and production-lean (but not over-engineered).
