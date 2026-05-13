# Backend Hardening Roadmap

This document turns the hardening section in `docs/BACKEND-CAPABILITIES-V2.md` into an execution roadmap.

It is not a product feature roadmap. It is a backend risk-reduction and clarity roadmap.

## 1. Executive Truth

The backend already does a lot. The problem is not missing domains. The problem is that some of the highest-value domains still rely on:

- request-path side effects
- inferred or overlapping state models
- migration seams that can fossilize into permanent architecture
- weak audit or observability on security-sensitive admin flows

If the team keeps adding features without hardening those areas, support debt and change risk will grow faster than capability.

## 2. Planning Assumptions

- NestJS, Prisma, and Postgres remain the platform.
- This roadmap assumes ordinary release-based evolution, not a rewrite.
- The team should treat this as a 3-6 month sequencing guide, not a promise that every item lands in one quarter.
- Capacity assumption: roughly 2-4 backend engineers with shared QA and frontend coordination.

## 3. Non-Goals

This roadmap is explicitly not trying to do the following:

- rewrite the backend into microservices
- replace NestJS or Prisma
- rename every route for aesthetic consistency
- redesign the whole schema at once
- chase "clean architecture" abstractions that do not reduce real risk

## 4. Workstream Summary

| Phase | Primary modules | Main goal | Why this phase exists | Rough size |
| --- | --- | --- | --- | --- |
| 1 | `auth`, `notifications`, `broadcasts` | remove expensive request-path delivery behavior | current email, push, and fan-out behavior can fail after commit or degrade latency badly | medium |
| 2 | `leases`, `maintenance-requests` | reduce workflow-state drift and orchestration risk | these are the two densest workflow engines and the highest regression risk areas | large |
| 3 | `owners`, `owner-portfolio`, `unit-ownerships`, `service-providers` | finish migration seams and tighten runtime access truth | owner/provider access still depends on transitional or ambiguous rules | medium-to-large |
| 4 | `access-control`, `users`, `residents` | improve auditability and identity-state clarity | security and onboarding behavior is powerful but too easy to misread | medium |
| 5 | `dashboard`, `buildings`, `parking`, `org-profile`, `health` | make ops/reporting surfaces more trustworthy and safer | lower change risk than phases 1-4, but still meaningful operational debt | small-to-medium |

## 5. Phase 1: Delivery Reliability

### Objective

Move operationally expensive side effects off the request path and make delivery failures visible instead of half-silent.

### In Scope

- queue-backed invite and reset delivery in `auth`
- queue-backed push delivery in `notifications`
- queue-backed broadcast fan-out in `broadcasts`
- correlation IDs and delivery-status visibility for async sends
- retry and dead-letter handling for outbound delivery jobs

### Concrete Changes

- stop treating email dispatch as "best effort after commit" with weak recovery visibility
- capture invite, reset, push, and broadcast delivery outcomes in a support-visible way
- make request handlers enqueue work and return durable write success without blocking on external delivery
- add idempotency rules so retries do not duplicate fan-out or onboarding state

### Exit Criteria

- request latency no longer includes push or broadcast fan-out cost
- invite and reset failures are visible without reading logs
- delivery retries are explicit and testable
- support can distinguish "user row exists" from "invite was actually delivered"

### Failure If Skipped

- users keep getting created successfully while onboarding delivery fails invisibly
- high-volume broadcasts or push spikes keep hurting ordinary API latency
- support keeps debugging outbound delivery through logs instead of product surfaces

## 6. Phase 2: Workflow Correctness

### Objective

Make the two heaviest workflow domains easier to reason about and harder to break.

### In Scope

- lease and contract lifecycle in `leases`
- move-in and move-out orchestration
- maintenance routing, approval, and assignment flows in `maintenance-requests`

### Concrete Changes

- make direct move-in and approved move-in execution share one canonical execution core
- make direct move-out, approved move-out, and cancellation-triggered move-out share one canonical execution core where possible
- tighten API language so `ACTIVE` contract is never casually presented as "moved in"
- publish and enforce allowed lease transition rules in code and tests
- split maintenance policy/routing logic from request-state mutation logic
- remove or reduce in-memory queue filtering where DB-backed filtering should exist

### Exit Criteria

- there is one primary execution path for each move lifecycle action
- lease tests assert transition rules, not only happy-path endpoint behavior
- maintenance queue behavior does not depend on broad in-memory filtering for correctness
- engineers can answer "what state is this in?" without reading multiple services

### Failure If Skipped

- dual move paths keep drifting
- frontend and ops teams keep overloading "active contract" to mean the wrong thing
- maintenance changes stay fragile because routing and execution are still densely coupled

## 7. Phase 3: Identity And Runtime Access Cleanup

### Objective

Remove transitional truth sources and make portal access explainable.

### In Scope

- ownership truth in `unit-ownerships` and `owner-portfolio`
- owner identity and access in `owners`
- provider membership and access in `service-providers`

### Concrete Changes

- finish the move from fallback `Unit.ownerId` reads to canonical active `UnitOwnership`
- expose clearer admin/support visibility into why an owner has runtime access
- make provider selection first-class when a user belongs to multiple provider memberships
- make provider grant and owner grant states easier to inspect without reading raw tables
- tighten cross-org identity-link assumptions and document them as policy instead of accidental behavior

### Exit Criteria

- owner portal scope can be explained from one primary ownership truth
- ambiguous multi-provider membership no longer relies on implicit selection
- admins can inspect why owner or provider portal access exists and when it changed
- migration fallback paths are either removed or clearly flagged as temporary

### Failure If Skipped

- migration seams become permanent
- support keeps seeing "why can this owner/provider see this?" tickets with poor answers
- cross-org identity assumptions stay risky and under-documented

## 8. Phase 4: Security And Onboarding Clarity

### Objective

Make security-sensitive admin changes more auditable and resident/onboarding behavior less ambiguous.

### In Scope

- `access-control`
- `users`
- `residents`

### Concrete Changes

- add stronger audit trails for assignment, override, and role-template changes
- formally deprecate compatibility role routes instead of leaving them as permanent baggage
- reduce permission namespace ambiguity where `contracts.*` and `leases.*` or legacy role naming still blur intent
- make resident lifecycle language explicit across provisioning, invite, profile, and occupancy flows
- improve provisioning observability so partially successful onboarding is visible and recoverable

### Exit Criteria

- admins can see who changed access and when
- compatibility routes have a retirement plan, not just a TODO
- support can explain why a resident is `NEW`, `ACTIVE`, or `FORMER`
- onboarding failures are recoverable without database archaeology

### Failure If Skipped

- security-sensitive changes remain weakly auditable
- resident identity stays inferred in ways that frontend and support teams misread
- compatibility APIs continue to confuse the access model

## 9. Phase 5: Operational Read Trust

### Objective

Clean up the lower-risk but high-support-cost surfaces that operators see every day.

### In Scope

- `dashboard`
- `buildings`
- `parking`
- `org-profile`
- `health`

### Concrete Changes

- add pagination and caching where dashboard activity feeds can grow badly
- fix timezone assumptions in trend reporting
- add delete impact preview and safer guardrails for buildings
- decide whether parking's dual allocation model is truly intentional or just accumulated history
- add a readiness endpoint; stop pretending liveness is enough for operations
- review business-sensitive `org-profile` writes for audit expectations

### Exit Criteria

- dashboard trends are explainable across timezones
- destructive building actions have visible blast-radius warnings
- parking semantics are documented and intentional
- readiness exists as a separate operational signal from liveness

### Failure If Skipped

- reporting trust keeps eroding
- destructive admin actions stay too easy to underestimate
- "system is up" remains confused with "system is ready"

## 10. Cross-Cutting Work That Should Happen Throughout

These are not separate phases. They should be attached to every phase above.

### A. State-transition tests

- add review-grade transition coverage for leases, owner grants, provider grants, maintenance status, and resident lifecycle edges
- prefer explicit transition assertions over endpoint-only smoke coverage

### B. Observability

- correlation IDs for async jobs and user-visible actions
- metrics for invite failures, push failures, broadcast lag, and queue age
- support-visible status for onboarding and delivery work

### C. Deprecation hygiene

- every compatibility seam needs:
  - an owner
  - a shutdown condition
  - a consumer inventory
  - a target removal window

### D. Docs that match runtime truth

- keep `docs/BACKEND-CAPABILITIES-V2.md` as the capability map
- keep the state-machine docs aligned with actual code behavior
- do not let roadmap language drift into fantasy if the runtime still behaves differently

## 11. Recommended Sequencing Rules

- Do phase 1 before phase 2 if the team can only do one thing at a time. Request-path side effects are expensive and noisy.
- Do not run large lease refactors and large maintenance refactors blindly in the same sprint unless the team actually has the capacity and test discipline for it.
- Do phase 3 before adding owner/provider feature surface that depends on the current migration seams.
- Do not leave access-control deprecations as "later." Security vocabulary drift becomes permanent surprisingly fast.

## 12. What Success Looks Like

Success is not "the backend has more code." Success looks like this:

- operational failures are more visible and less user-facing
- runtime access can be explained from canonical truth sources
- workflow state is documented and enforced, not inferred from side effects
- support and frontend teams stop guessing what "active" means in critical domains
- compatibility seams are shrinking instead of becoming architecture
