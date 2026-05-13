You are Codex acting as a senior NestJS performance + reliability engineer.

Context
- The NestJS backend already exists.
- Objective: review the entire repo and identify + implement optimizations to improve:
  1) request throughput (RPS)
  2) p95/p99 latency
  3) database efficiency (Postgres/Prisma)
  4) memory/CPU usage (AWS cost)
  5) reliability (timeouts, shutdown, health checks)

Instructions
1) First: map the architecture
- Summarize modules, controllers, services, middlewares, interceptors, guards, providers.
- Identify request hot paths (highest frequency endpoints) and DB-heavy endpoints.
- Identify any blocking sync work done during requests.

2) Add lightweight profiling / measurement
- Add request timing metrics (middleware/interceptor) to log p50/p95/p99 per route in prod-safe way.
- Add correlation id (x-request-id) if missing.
- Ensure logs are structured and not overly verbose in production.

3) Database / Prisma review (highest priority)
- Confirm PrismaClient singleton usage. Fix if Prisma is instantiated per request.
- Audit queries:
  - N+1 patterns (loops calling DB)
  - missing pagination/limits
  - missing indexes for filter/sort columns
  - heavy includes/selects (overfetching)
  - unbounded ORDER BY on large sets
- Add/adjust indexes in Prisma schema + generate migration(s).
- Ensure transactions are used only when needed.
- Add safe pagination helpers (cursor-based or limit/offset with max limit).
- Add connection/timeouts configuration (statement_timeout, query timeout patterns if applicable).

4) HTTP runtime tuning
- Enable/verify: compression, helmet, CORS config.
- Set sane timeouts at server + reverse proxy level (document env vars).
- Ensure the app is stateless and safe to scale horizontally.
- Add graceful shutdown:
  - enableShutdownHooks
  - close DB connections
  - stop accepting new requests, allow in-flight to finish

5) Memory / CPU optimization
- Find large in-memory data loads, huge JSON serialization, or repeated computations.
- Replace expensive operations with streaming/chunking when relevant.
- Ensure DTO validation isn’t overly expensive (validate only where needed, avoid deep transforms).
- Remove unnecessary console logs and debug logs in prod.

6) Caching (optional, only if it helps)
- Identify endpoints that are read-heavy and can be cached safely.
- Implement caching via Nest cache manager with TTL and cache keys.
- Redis support should be optional via env; app must run without it.

7) Error handling & stability
- Ensure global exception filter returns consistent errors and avoids leaking internals.
- Add rate limiting only if missing and if endpoints are public.
- Validate input to prevent expensive queries (max page size, max filter lengths).

8) Deliverables
- Produce:
  A) A prioritized “Optimization Report” with:
     - issue, impact, how to reproduce, recommended fix, estimated effort, risk level
  B) Implement fixes directly in code (create a PR branch or commit plan)
  C) Add or update docs:
     - README “Performance & Cost” section
     - env vars for tuning
     - how to run basic load test locally

9) Testing & verification
- Add at least one basic load test script (k6 or autocannon) to compare before/after.
- Run unit/integration tests; add tests where changes affect correctness.
- Ensure changes are backwards compatible with existing clients (Next.js + React Native).

Constraints
- Keep changes minimal and high-impact.
- Don’t introduce heavy new infrastructure unless justified.
- Avoid breaking API responses.

Start now:
- Scan the repository.
- List the top 10 optimization opportunities in descending priority.
- Then implement the top 3 with code changes.
